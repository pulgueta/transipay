/** A checkout link stays open this long. Wompi refuses a payment after the expiration time. */
export const CHECKOUT_TTL_MS = 30 * 60 * 1000;

export const checkoutExpiresAt = (createdAt: Date) =>
  new Date(createdAt.getTime() + CHECKOUT_TTL_MS);

export interface PendingPayment {
  amountInCents: number;
  createdAt: Date;
}

/**
 * Finds an open payment with the same amount whose checkout link is not expired.
 * The checkout gives this payment again, so two tabs do not make two payable links.
 */
export const findReusablePayment = <T extends PendingPayment>(
  pending: readonly T[],
  amountInCents: number,
  now: Date
) =>
  pending.find(
    (row) =>
      row.amountInCents === amountInCents &&
      checkoutExpiresAt(row.createdAt) > now
  );
