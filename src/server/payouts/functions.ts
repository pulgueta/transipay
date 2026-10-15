import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { pageInputSchema, toPage } from "@/server/db/pagination";
import { entity, entityBankAccount } from "@/server/db/schema/entities";
import { PAYOUT_STATUSES, payout } from "@/server/db/schema/payments";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { getWompiPayouts } from "@/server/wompi";

import type { PayoutDeps } from "./port";
import { createPayout, runPayoutQueue } from "./queue";

/** Banks that can receive payouts. Use the bank id in an entity bank account. */
export const listPayoutBanksFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ payout: ["read"] })])
  .handler(async () => {
    const [error, banks] = await getWompiPayouts().listBanks();
    if (error) {
      throw httpError(502, "We cannot get the bank list now. Try again.");
    }
    return banks.map((bank) => ({
      id: bank.id,
      name: bank.name ?? null,
      code: bank.code ?? null,
    }));
  });

/** The payouts for the staff page, newest first, with an optional status filter. Keyset on `id`. */
export const listPayoutsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ payout: ["read"] })])
  .validator(
    pageInputSchema.extend({ status: z.enum(PAYOUT_STATUSES).optional() })
  )
  .handler(async ({ data }) => {
    const rows = await db
      .select({
        id: payout.id,
        entityName: entity.name,
        amountInCents: payout.amountInCents,
        currency: payout.currency,
        status: payout.status,
        reviewReason: payout.reviewReason,
        providerPayoutId: payout.providerPayoutId,
        reference: payout.reference,
        createdAt: payout.createdAt,
      })
      .from(payout)
      .innerJoin(entity, eq(entity.id, payout.entityId))
      .where(
        and(
          data.status === undefined
            ? undefined
            : eq(payout.status, data.status),
          data.cursor === undefined ? undefined : lt(payout.id, data.cursor)
        )
      )
      .orderBy(desc(payout.id))
      .limit(data.limit + 1);
    return toPage(rows, data.limit);
  });

/** The active entities that can receive a payout now: each one has a default bank account. */
export const listPayoutTargetsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ payout: ["create"] })])
  .handler(
    async () =>
      await db
        .select({ id: entity.id, name: entity.name, kind: entity.kind })
        .from(entity)
        .innerJoin(
          entityBankAccount,
          and(
            eq(entityBankAccount.entityId, entity.id),
            eq(entityBankAccount.isDefault, true)
          )
        )
        .where(eq(entity.isActive, true))
        .orderBy(entity.name)
  );

const payoutDeps = (actorId: string): PayoutDeps => ({
  database: db,
  payouts: getWompiPayouts(),
  originAccountId: serverEnv.WOMPI_PAYOUTS_ACCOUNT_ID,
  actorId,
});

/**
 * Sends money to the default bank account of an entity.
 * The client sends one idempotency key per payout. A repeated request with the same key returns the stored payout
 * and does not make a second payout. The payout row is queued with a snapshot of the bank account before the Wompi call,
 * so a lost response does not lose the payout. The returned status comes from the database.
 * The final status comes through the payouts webhook or reconciliation.
 */
export const createPayoutFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ payout: ["create"] })])
  .validator(
    z.object({
      entityId: z.uuid(),
      amountInCents: z.int().positive(),
      // Wompi accepts 1 to 64 letters, digits, or hyphens. A UUID from the form is correct.
      idempotencyKey: z.string().regex(/^[A-Za-z0-9-]{1,64}$/u),
    })
  )
  .handler(async ({ context, data }) => {
    const result = await createPayout(payoutDeps(context.actorId), data);
    switch (result.kind) {
      case "ok": {
        return { payoutId: result.payoutId, status: result.status };
      }
      case "conflict": {
        throw httpError(
          409,
          "This request key is used by another payout. Start a new payout."
        );
      }
      case "not_configured": {
        throw httpError(503, "Payouts are not configured on this server.");
      }
      case "entity_not_found": {
        throw httpError(404, "We cannot find this entity.");
      }
      case "entity_inactive": {
        throw httpError(409, "This entity is not active.");
      }
      case "no_default_account": {
        throw httpError(
          409,
          "This entity has no default bank account. Add one before you send a payout."
        );
      }
      default: {
        throw new Error("Unknown payout result.");
      }
    }
  });

/**
 * Runs the payout queue one time: uncertain payouts are reconciled with Wompi, then queued payouts are sent.
 * Staff can run it now. A scheduler can call `runPayoutQueue` later.
 */
export const reconcilePayoutsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ payout: ["create"] })])
  .handler(
    async ({ context }) => await runPayoutQueue(payoutDeps(context.actorId))
  );
