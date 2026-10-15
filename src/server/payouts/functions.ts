import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { pageInputSchema } from "@/server/db/pagination";
import { PAYOUT_STATUSES } from "@/server/db/schema/payments";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { isInScope, staffScopeFor } from "@/server/staff/scope";
import { getWompiPayouts } from "@/server/wompi";

import type { PayoutDeps } from "./port";
import { createPayout, runPayoutQueue } from "./queue";
import { listPayoutTargets, listPayouts } from "./staff-read";

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

/** The payouts of the entities of the staff member (see `listPayouts`). */
export const listPayoutsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ payout: ["read"] })])
  .validator(
    pageInputSchema.extend({ status: z.enum(PAYOUT_STATUSES).optional() })
  )
  .handler(
    async ({ context, data }) =>
      await listPayouts(db, {
        ...data,
        scope: await staffScopeFor(db, context.user),
      })
  );

/** The active entities of the staff member that can receive a payout now: each one has a default bank account. */
export const listPayoutTargetsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ payout: ["create"] })])
  .handler(
    async ({ context }) =>
      await listPayoutTargets(db, await staffScopeFor(db, context.user))
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
 * The entity must be in the scope of the staff member. This check comes before the idempotency key.
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
    if (!isInScope(await staffScopeFor(db, context.user), data.entityId)) {
      throw httpError(403, "You do not work for this entity.");
    }
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
