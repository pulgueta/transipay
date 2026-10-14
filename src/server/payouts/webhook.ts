import "@tanstack/react-start/server-only";
import type { Payout, Result } from "@pulgueta/wompi/schemas";
import { verifyPayoutEvent } from "@pulgueta/wompi/server";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import type { Database, Transaction } from "@/server/db/client";
import { payout } from "@/server/db/schema/payments";
import { claimEvent, markEventProcessed } from "@/server/webhook-inbox";
import { getWompiPayouts } from "@/server/wompi";

import {
  FINAL_PAYOUT_STATUSES,
  resolvePayoutUpdate,
  statusFromWompiPayout,
} from "./status";

/**
 * Applies a payout that we got from the Wompi API. Returns false when staff must examine the event:
 * no payout of ours matches, the match is not clear, or the status is not documented.
 */
const applyPayoutUpdate = async (tx: Transaction, apiPayout: Payout) => {
  // The reference also finds a payout whose create response was lost before we stored the Wompi id.
  const rows = await tx
    .select({
      id: payout.id,
      status: payout.status,
      providerPayoutId: payout.providerPayoutId,
    })
    .from(payout)
    .where(
      apiPayout.reference === undefined
        ? eq(payout.providerPayoutId, apiPayout.id)
        : or(
            eq(payout.providerPayoutId, apiPayout.id),
            eq(payout.reference, apiPayout.reference)
          )
    )
    .for("update");
  const current = rows.length === 1 ? rows[0] : undefined;
  if (
    !current ||
    (current.providerPayoutId !== null &&
      current.providerPayoutId !== apiPayout.id)
  ) {
    return false;
  }
  const target = statusFromWompiPayout(apiPayout.status);
  if (target === undefined) {
    return false;
  }

  const update = resolvePayoutUpdate(current.status, target);
  if (update.kind === "unchanged") {
    return true;
  }

  // Conditional: the payout changes only from the status that the decision used.
  // A 'submitting' payout loses its lease, so the dispatcher result cannot overwrite this status.
  const changed = await tx
    .update(payout)
    .set({
      status: update.status,
      providerPayoutId: apiPayout.id,
      leaseToken: null,
      leaseExpiresAt: null,
      reviewReason: null,
      finalizedAt: FINAL_PAYOUT_STATUSES.includes(update.status)
        ? new Date()
        : null,
    })
    .where(and(eq(payout.id, current.id), eq(payout.status, current.status)))
    .returning({ id: payout.id });
  if (changed.length !== 1) {
    throw new Error("The payout changed during the update. Try again.");
  }
  return true;
};

/**
 * The only event that we use. It checks only the fields that we read: the event name and the payout id.
 * The SDK guard also requires fields that the signature can omit (for example `status`),
 * and we read these fields from the Wompi API.
 */
const payoutUpdatedEvent = z.object({
  event: z.literal("payout.updated"),
  data: z.object({ payout: z.object({ id: z.string() }) }),
});

/**
 * Names the Wompi payouts account that signs the events. The events key belongs to this account,
 * so the same checksum from another account is a different event.
 */
export const payoutIntegration = (userPrincipalId: string) =>
  `wompi-payouts:${userPrincipalId}`;

export interface PayoutWebhookDeps {
  database: Database;
  eventsKey: string;
  /** The account that signs the events (see `payoutIntegration`). */
  integration: string;
  /** Gets one payout batch from the Wompi payouts API. */
  getPayout: (id: string) => Promise<Result<Payout>>;
}

/**
 * Handles a Wompi payouts event and returns the HTTP status for the response.
 * The signature covers only the fields in `signature.properties`. We use only the signed `payout.id`,
 * get the payout from the Wompi API with it, and use the reference and status from the API.
 * The event row and its effects commit in one transaction. If the API or the processing fails,
 * nothing commits, we answer 5xx, and Wompi sends the event again.
 * Only `payout.updated` changes data: our batches hold one transaction, so the batch status is enough.
 * Other events get no inbox row.
 * The audit actor is null: the gateway, not a user, makes these changes.
 */
export const processPayoutWebhook = async (
  rawBody: string,
  deps: PayoutWebhookDeps
) => {
  const [error, event] = await verifyPayoutEvent(rawBody, {
    eventsKey: deps.eventsKey,
  });
  if (error) {
    return 401;
  }

  // The signature does not cover the event name. Thus we do not write an inbox row for an event that we do not use:
  // a changed copy with the same checksum must not make the real event a duplicate.
  const supported = payoutUpdatedEvent.safeParse(event);
  if (!supported.success) {
    return 200;
  }
  if (!event.signature.properties.includes("payout.id")) {
    return 401;
  }
  const payoutId = supported.data.data.payout.id;

  const [fetchError, apiPayout] = await deps.getPayout(payoutId);
  if (fetchError || apiPayout.id !== payoutId) {
    return 502;
  }

  const inboxEvent = {
    integration: deps.integration,
    eventType: event.event,
    checksum: event.signature.checksum,
    payload: event,
  };
  await deps.database.transaction(async (tx) => {
    const eventId = await claimEvent(tx, inboxEvent);
    // Null: we already processed this event.
    if (eventId === null) {
      return;
    }
    // An event that needs review keeps processed_at null, so that staff can find it.
    if (await applyPayoutUpdate(tx, apiPayout)) {
      await markEventProcessed(tx, eventId);
    }
  });

  return 200;
};

export const handlePayoutWebhook = async (rawBody: string) =>
  await processPayoutWebhook(rawBody, {
    database: db,
    eventsKey: serverEnv.WOMPI_PAYOUTS_EVENTS_KEY,
    integration: payoutIntegration(serverEnv.WOMPI_PAYOUTS_USER_PRINCIPAL_ID),
    getPayout: async (id) => await getWompiPayouts().getPayout(id),
  });
