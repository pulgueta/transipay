import type {
  PayoutStatus as WompiPayoutStatus,
  PayoutTransactionStatus as WompiTransactionStatus,
} from "@pulgueta/wompi/schemas";

import type { PayoutStatus } from "@/server/db/schema/payments";

/** The statuses that Wompi can give to a payout that it received. */
export type FinancialStatus = Extract<
  PayoutStatus,
  "submitted" | "paid" | "failed"
>;

export const FINAL_PAYOUT_STATUSES: readonly PayoutStatus[] = [
  "paid",
  "failed",
];

// Our payout batches hold one transaction, so a partial payment is not final: it needs a later event.
// Wompi can send statuses that are not documented, so the lookup key is a plain string.
const STATUS_BY_WOMPI_PAYOUT = new Map<string, FinancialStatus>(
  Object.entries({
    TOTAL_PAYMENT: "paid",
    REJECTED: "failed",
    NOT_APPROVED: "failed",
    AFE_REJECTED: "failed",
    PENDING: "submitted",
    PENDING_APPROVAL: "submitted",
    AFE_ON_HOLD: "submitted",
    PARTIAL_PAYMENT: "submitted",
  } satisfies Record<WompiPayoutStatus, FinancialStatus>)
);

const STATUS_BY_WOMPI_TRANSACTION = new Map<string, FinancialStatus>(
  Object.entries({
    APPROVED: "paid",
    REJECTED: "failed",
    FAILED: "failed",
    CANCELLED: "failed",
    PENDING: "submitted",
    PROCESSING: "submitted",
    READY_TO_FILE: "submitted",
    ADDED_TO_FILE: "submitted",
  } satisfies Record<WompiTransactionStatus, FinancialStatus>)
);

/** Our status for a Wompi payout batch status. Undefined for a status that is not documented. */
export const statusFromWompiPayout = (wompiStatus: string) =>
  STATUS_BY_WOMPI_PAYOUT.get(wompiStatus);

/** Our status for a Wompi payout transaction status. Undefined for a status that is not documented. */
export const statusFromWompiTransaction = (wompiStatus: string) =>
  STATUS_BY_WOMPI_TRANSACTION.get(wompiStatus);

export type PayoutUpdate =
  | { kind: "unchanged" }
  | { kind: "applied"; status: FinancialStatus };

/**
 * Decides what a status from Wompi (webhook or reconciliation) does to our payout.
 * A final payout does not change again, but a failed payout becomes paid: Wompi moved the money,
 * so the local failure was not correct. A draft was never sent, so Wompi cannot change it.
 */
export const resolvePayoutUpdate = (
  current: PayoutStatus,
  target: FinancialStatus
): PayoutUpdate => {
  if (current === "failed" && target === "paid") {
    return { kind: "applied", status: target };
  }
  if (
    target === current ||
    current === "draft" ||
    FINAL_PAYOUT_STATUSES.includes(current)
  ) {
    return { kind: "unchanged" };
  }
  return { kind: "applied", status: target };
};

export type SubmissionCertainty = "accepted" | "rejected" | "unknown";

/**
 * The status after a send. A rejection is final only on the first send:
 * on a later send, an earlier send with the same key can exist at Wompi.
 */
export const statusAfterSubmission = (
  certainty: SubmissionCertainty,
  { firstDispatch }: { firstDispatch: boolean }
): PayoutStatus => {
  if (certainty === "accepted") {
    return "submitted";
  }
  if (certainty === "rejected" && firstDispatch) {
    return "failed";
  }
  return "uncertain";
};
