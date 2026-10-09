import type {
  PayoutStatus as WompiPayoutStatus,
  WompiErrorResult,
} from "@pulgueta/wompi/schemas";

import type { PayoutStatus } from "@/server/db/schema/payments";

export const FINAL_PAYOUT_STATUSES: readonly PayoutStatus[] = [
  "paid",
  "failed",
];

// Our payout batches hold one transaction, so a partial payment is not final: it needs a later event.
// Events can carry statuses that are not documented, so the lookup key is a plain string.
const STATUS_BY_WOMPI_STATUS = new Map<string, PayoutStatus>(
  Object.entries({
    TOTAL_PAYMENT: "paid",
    REJECTED: "failed",
    NOT_APPROVED: "failed",
    AFE_REJECTED: "failed",
    PENDING: "processing",
    PENDING_APPROVAL: "processing",
    AFE_ON_HOLD: "processing",
    PARTIAL_PAYMENT: "processing",
  } satisfies Record<WompiPayoutStatus, PayoutStatus>)
);

export type PayoutUpdate =
  | { kind: "unchanged" }
  | { kind: "applied"; status: PayoutStatus };

/**
 * Decides what a Wompi payout status does to our payout. A final payout does not change again,
 * but a failed payout becomes paid: Wompi moved the money, so the local failure was not correct.
 */
export const resolvePayoutUpdate = (
  current: PayoutStatus,
  wompiStatus: string
): PayoutUpdate => {
  const status = STATUS_BY_WOMPI_STATUS.get(wompiStatus);

  if (current === "failed" && status === "paid") {
    return { kind: "applied", status };
  }

  if (
    status === undefined ||
    status === current ||
    FINAL_PAYOUT_STATUSES.includes(current)
  ) {
    return { kind: "unchanged" };
  }

  return { kind: "applied", status };
};

/**
 * True when Wompi refused the payout request, so no money moves.
 * A network error, a timeout, a 5xx, or an invalid success body gives no known result:
 * the payout can exist at Wompi, so it must stay open until a webhook event arrives.
 * A 409 (used reference or idempotency key) and any error on a retry also give no known result,
 * because an earlier request can have created the payout.
 */
export const isDefiniteRejection = (
  error: WompiErrorResult,
  { retry }: { retry: boolean }
) => {
  if (retry) {
    return false;
  }
  if ("type" in error) {
    if (error.type === "NOT_FOUND_ERROR") {
      return true;
    }
    if (error.type === "INPUT_VALIDATION_ERROR") {
      return true;
    }
  }

  return (
    "statusCode" in error &&
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.statusCode !== 409
  );
};
