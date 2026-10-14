/** A checkout link stays open this long. Wompi refuses a payment after the expiration time. */
export const CHECKOUT_TTL_MS = 30 * 60 * 1000;

export const checkoutExpiresAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + CHECKOUT_TTL_MS);

export interface PendingPayment {
  amountInCents: number;
  createdAt: Date;
}

export type CheckoutDecision<T> =
  // Wompi has a transaction in progress for this target. Its result decides, so no new payment starts.
  | { kind: "in_progress" }
  // An open link has a different amount. A new payment can start at `until`.
  | { kind: "wait"; until: Date }
  | { kind: "reuse"; payment: T }
  | { kind: "create" };

/**
 * Decides if a checkout can start for a target, from its pending payments after reconciliation.
 * An open link with the same amount is given again, so two tabs do not make two payable links.
 * An expired link without a transaction cannot collect money, so it does not block.
 */
export const decideCheckout = <T extends PendingPayment>(input: {
  open: readonly T[];
  hasPendingTransaction: boolean;
  amountInCents: number;
  now: Date;
}): CheckoutDecision<T> => {
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
