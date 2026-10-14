import type { PaymentStatus } from "@/server/db/schema/payments";

/** What the result page shows. `review` and `expired` come from more than the payment status. */
export type ResultState = PaymentStatus | "review";

export interface ResultInput {
  status: PaymentStatus;
  /** True when an attempt waits for staff (a second approval or a target that is not payable). */
  needsReview: boolean;
  /** True when the checkout link time passed (server clock). */
  checkoutExpired: boolean;
  attemptCount: number;
}

/**
 * Decides the state of the result page.
 * A payment under review never shows as complete: staff must examine it, and the citizen must not pay again.
 * A pending payment whose link expired with no transaction cannot get a result, so the citizen can pay again.
 */
export const resolveResultState = (payment: ResultInput): ResultState => {
  if (payment.needsReview) {
    return "review";
  }
  if (
    payment.status === "pending" &&
    payment.attemptCount === 0 &&
    payment.checkoutExpired
  ) {
    return "expired";
  }
  return payment.status;
};
