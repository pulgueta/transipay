import "@tanstack/react-start/server-only";
import {
  isPayoutUpdatedEvent,
  verifyPayoutEvent,
} from "@pulgueta/wompi/server";
import { eq, or } from "drizzle-orm";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { payout } from "@/server/db/schema/payments";

import { FINAL_PAYOUT_STATUSES, resolvePayoutUpdate } from "./status";

/**
 * Handles a Wompi payouts event and returns the HTTP status for the response.
 * Only `payout.updated` changes data. A repeated event has no effect, because a final payout does not change.
 * The audit actor is null: the gateway, not a user, makes these changes.
 */
export const handlePayoutWebhook = async (rawBody: string) => {
  const [error, event] = await verifyPayoutEvent(rawBody, {
    eventsKey: serverEnv.WOMPI_PAYOUTS_EVENTS_KEY,
  });
  if (error) {
    return 401;
  }
  if (!isPayoutUpdatedEvent(event)) {
    return 200;
  }

  const { id, status, reference } = event.data.payout;

  await db.transaction(async (tx) => {
    // The reference also matches a payout whose create response was lost before we stored the Wompi id.
    const rows = await tx
      .select({ id: payout.id, status: payout.status })
      .from(payout)
      .where(
        reference === undefined
          ? eq(payout.providerPayoutId, id)
          : or(eq(payout.providerPayoutId, id), eq(payout.reference, reference))
      )
      .for("update");
    const current = rows.at(0);
    if (!current) {
      return;
    }

    const update = resolvePayoutUpdate(current.status, status);
    if (update.kind === "unchanged") {
      return;
    }

    await tx
      .update(payout)
      .set({
        status: update.status,
        providerPayoutId: id,
        finalizedAt: FINAL_PAYOUT_STATUSES.includes(update.status)
          ? new Date()
          : null,
      })
      .where(eq(payout.id, current.id));
  });

  return 200;
};
