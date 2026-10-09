import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import { entity, entityBankAccount } from "@/server/db/schema/entities";
import { payout } from "@/server/db/schema/payments";
import { withActor } from "@/server/db/with-actor";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { getWompiPayouts } from "@/server/wompi";

import { buildPayoutTransaction } from "./build-transaction";
import { resolveExistingPayout } from "./idempotency";
import { isDefiniteRejection } from "./status";

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

const payoutColumns = {
  id: payout.id,
  entityId: payout.entityId,
  entityBankAccountId: payout.entityBankAccountId,
  amountInCents: payout.amountInCents,
  reference: payout.reference,
  idempotencyKey: payout.idempotencyKey,
  status: payout.status,
  providerPayoutId: payout.providerPayoutId,
};

/**
 * Sends money to the default bank account of an entity.
 * The payout row exists before the Wompi call, so that a lost response does not lose the payout.
 * The client sends one idempotency key per payout. A repeated request with the same key does not make a second payout:
 * it sends the stored payout again (same key and reference) only when Wompi did not confirm it.
 * The final status comes through the payouts webhook.
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
    const accountId = serverEnv.WOMPI_PAYOUTS_ACCOUNT_ID;
    if (accountId === undefined) {
      throw httpError(503, "Payouts are not configured on this server.");
    }

    const targets = await db
      .select({
        email: entity.email,
        isActive: entity.isActive,
        account: entityBankAccount,
      })
      .from(entity)
      .leftJoin(
        entityBankAccount,
        and(
          eq(entityBankAccount.entityId, entity.id),
          eq(entityBankAccount.isDefault, true)
        )
      )
      .where(eq(entity.id, data.entityId));
    const target = targets.at(0);
    if (!target) {
      throw httpError(404, "We cannot find this entity.");
    }
    if (!target.isActive) {
      throw httpError(409, "This entity is not active.");
    }
    if (!target.account) {
      throw httpError(
        409,
        "This entity has no default bank account. Add one before you send a payout."
      );
    }
    const defaultAccount = target.account;

    const stored = await withActor(context.actorId, async (tx) => {
      // On a key conflict, the insert waits for the other transaction and then does nothing.
      const inserted = await tx
        .insert(payout)
        .values({
          entityId: data.entityId,
          entityBankAccountId: defaultAccount.id,
          amountInCents: data.amountInCents,
          reference: `tp_po_${crypto.randomUUID()}`,
          idempotencyKey: data.idempotencyKey,
        })
        .onConflictDoNothing({ target: payout.idempotencyKey })
        .returning(payoutColumns);
      const created = inserted.at(0);
      if (created) {
        return { row: created, action: "send" as const };
      }

      const [existing] = await tx
        .select(payoutColumns)
        .from(payout)
        .where(eq(payout.idempotencyKey, data.idempotencyKey));
      return { row: existing, action: resolveExistingPayout(existing, data) };
    });

    const { row } = stored;
    if (stored.action === "conflict") {
      throw httpError(
        409,
        "This request key is used by another payout. Start a new payout."
      );
    }
    if (stored.action === "existing") {
      return { payoutId: row.id, status: row.status };
    }

    // A retry sends the bank account that the payout stored, also when the default account changed.
    const storedAccounts =
      row.entityBankAccountId === defaultAccount.id
        ? [defaultAccount]
        : await db
            .select()
            .from(entityBankAccount)
            .where(eq(entityBankAccount.id, row.entityBankAccountId));
    const [account] = storedAccounts;

    const [error, result] = await getWompiPayouts().createPayout(
      {
        reference: row.reference,
        accountId,
        paymentType: "PROVIDERS",
        transactions: [
          buildPayoutTransaction(account, {
            email: target.email,
            amountInCents: row.amountInCents,
          }),
        ],
      },
      { idempotencyKey: row.idempotencyKey }
    );

    // Unknown result (network error, timeout, 5xx, conflict, or retry): keep the payout pending until a webhook event arrives.
    if (
      error &&
      !isDefiniteRejection(error, { retry: stored.action === "retry" })
    ) {
      return { payoutId: row.id, status: "pending" as const };
    }

    // A webhook event can arrive before this update. Change the status only while it is still pending.
    const stillPending = and(
      eq(payout.id, row.id),
      eq(payout.status, "pending")
    );

    if (error) {
      await withActor(context.actorId, async (tx) => {
        await tx
          .update(payout)
          .set({ status: "failed", finalizedAt: new Date() })
          .where(stillPending);
      });
      return { payoutId: row.id, status: "failed" as const };
    }

    await withActor(context.actorId, async (tx) => {
      await tx
        .update(payout)
        .set({ providerPayoutId: result.payoutId })
        .where(eq(payout.id, row.id));
      await tx.update(payout).set({ status: "processing" }).where(stillPending);
    });
    return { payoutId: row.id, status: "processing" as const };
  });
