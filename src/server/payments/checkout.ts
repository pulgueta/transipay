import type { PaymentStatus } from "@/server/db/schema/payments";

/** A checkout link stays open this long. Wompi refuses a payment after the expiration time. */
export const CHECKOUT_TTL_MS = 30 * 60 * 1000;

export const checkoutExpiresAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + CHECKOUT_TTL_MS);

/**
 * A payment that is not approved can still settle until this time after its checkout started.
 * After a decline, Wompi can make a new transaction with the same reference while the link is open
 * (payment retry), and a transaction that started before the link expired can get its final status
 * hours later (a bank transfer). 24 hours covers the link time and the longest bank settlement.
 * After this time, a late approval still moves the payment, but only through a webhook or a manual reconciliation:
 * the checkout, the sweep, and the result page do not ask Wompi about it any more.
 */
export const SETTLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Tells if a late Wompi transaction can still move a payment, so it must be reconciled before a new checkout.
 * A pending payment can always settle. A declined, voided, error, or expired payment can settle inside
 * `SETTLE_WINDOW_MS`. An approved payment is settled.
 */
export const canStillSettle = (
  payment: { status: PaymentStatus; createdAt: Date },
  now: Date
) =>
  payment.status === "pending" ||
  (payment.status !== "approved" &&
    payment.createdAt.getTime() + SETTLE_WINDOW_MS > now.getTime());

export interface PendingPayment {
  amountInCents: number;
  createdAt: Date;
}

export type CheckoutDecision<T> =
  // An approved attempt of the obligation waits for staff. The citizen must not pay again until staff decide.
  | { kind: "under_review" }
  // Wompi has a transaction in progress for the obligation. Its result decides, so no new payment starts.
  | { kind: "in_progress" }
  // An open link has a different amount. A new payment can start at `until`.
  | { kind: "wait"; until: Date }
  | { kind: "reuse"; payment: T }
  | { kind: "create" };

/**
 * Decides if a checkout can start for a target, from its pending payments after reconciliation.
 * An attempt under review or in progress on any target of the obligation blocks first: money can already be collected.
 * An open link with the same amount is given again, so two tabs do not make two payable links.
 * An expired link without a transaction cannot collect money, so it does not block.
 */
export const decideCheckout = <T extends PendingPayment>(input: {
  open: readonly T[];
  hasPendingTransaction: boolean;
  hasAttemptUnderReview: boolean;
  amountInCents: number;
  now: Date;
}): CheckoutDecision<T> => {
  if (input.hasAttemptUnderReview) {
    return { kind: "under_review" };
  }
  if (input.hasPendingTransaction) {
    return { kind: "in_progress" };
  }

  const live = input.open.filter(
    (row) => checkoutExpiresAt(row.createdAt) > input.now
  );
  const reusable = live.find(
    (row) => row.amountInCents === input.amountInCents
  );
  if (reusable) {
    return { kind: "reuse", payment: reusable };
  }

  let until: Date | null = null;
  for (const row of live) {
    const expiresAt = checkoutExpiresAt(row.createdAt);
    if (until === null || expiresAt > until) {
      until = expiresAt;
    }
  }
  return until === null ? { kind: "create" } : { kind: "wait", until };
};
