import "@tanstack/react-start/server-only";
import type {
  Result,
  Transaction as WompiTransaction,
} from "@pulgueta/wompi/schemas";
import { and, eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { payment, paymentAttempt } from "@/server/db/schema/payments";
import { runAsActor } from "@/server/db/with-actor";
import { getWompi } from "@/server/wompi";

import { checkoutExpiresAt } from "./checkout";
import { applyTransactionUpdate } from "./webhook";

export interface ReconcileDeps {
  database: Database;
  /** Lists the transactions of one reference from the Wompi API (`GET /transactions?reference=`). */
  listTransactions: (reference: string) => Promise<Result<WompiTransaction[]>>;
}

export type ReconcileResult =
  | { kind: "reconciled" }
  | { kind: "not_found" }
  // The Wompi API failed. The payment did not change.
  | { kind: "unavailable" };

/** Oldest first. A transaction without a time goes last. */
const byCreatedAt = (a: WompiTransaction, b: WompiTransaction) =>
  (a.created_at ?? "￿").localeCompare(b.created_at ?? "￿");

/**
 * Makes our payment agree with Wompi when a webhook was lost.
 * It asks Wompi for the transactions of the payment reference and applies each one
 * through the webhook path, so an approval pays the obligation one time only, and a repeat changes nothing.
 * A transaction with another reference is ignored: Wompi is the source of the reference, not the caller.
 * When Wompi has no transaction and the checkout link expired, the payment becomes `expired`.
 * The Wompi call runs outside the database transaction, so no row stays locked during the network call.
 */
export const reconcilePayment = async (
  paymentId: string,
  deps: ReconcileDeps,
  actorUserId: string | null = null
): Promise<ReconcileResult> => {
  const rows = await deps.database
    .select({ reference: payment.reference })
    .from(payment)
    .where(eq(payment.id, paymentId));
  const current = rows.at(0);
  if (!current) {
    return { kind: "not_found" };
  }

  const [error, transactions] = await deps.listTransactions(current.reference);
  if (error) {
    return { kind: "unavailable" };
  }
  // `filter` gives a new array, so the sort changes nothing that the caller has. `toSorted` is not in the ES2022 lib.
  const own = transactions
    .filter((transaction) => transaction.reference === current.reference)
    // oxlint-disable-next-line unicorn/no-array-sort -- See the comment above.
    .sort(byCreatedAt);

  for (const transaction of own) {
    // oxlint-disable-next-line no-await-in-loop -- Each transaction commits alone, in the order Wompi made them.
    await runAsActor(deps.database, actorUserId, async (tx) => {
      await applyTransactionUpdate(tx, transaction);
    });
  }

  await runAsActor(deps.database, actorUserId, async (tx) => {
    const locked = await tx
      .select({ status: payment.status, createdAt: payment.createdAt })
      .from(payment)
      .where(eq(payment.id, paymentId))
      .for("update");
    const row = locked.at(0);
    const now = new Date();
    if (
      !row ||
      row.status !== "pending" ||
      checkoutExpiresAt(row.createdAt) > now
    ) {
      return;
    }
    // An attempt means that Wompi made a transaction for this reference. Its result decides, not the link time.
    const attempts = await tx.$count(
      paymentAttempt,
      eq(paymentAttempt.paymentId, paymentId)
    );
    if (attempts > 0) {
      return;
    }
    await tx
      .update(payment)
      .set({ status: "expired", finalizedAt: now })
      .where(and(eq(payment.id, paymentId), eq(payment.status, "pending")));
  });

  return { kind: "reconciled" };
};

/** Reconciles one payment with the configured Wompi account. */
export const reconcilePaymentWithWompi = async (
  paymentId: string,
  actorUserId: string | null
) =>
  await reconcilePayment(
    paymentId,
    {
      database: db,
      listTransactions: async (reference) =>
        await getWompi().transactions.listTransactions({ reference }),
    },
    actorUserId
  );
