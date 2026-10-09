import type {
  PayoutPage,
  PayoutTransaction,
  Result,
} from "@pulgueta/wompi/schemas";

import { statusFromWompiTransaction } from "./status";
import type { FinancialStatus } from "./status";

export type Lookup =
  | {
      kind: "found";
      status: FinancialStatus;
      providerPayoutId: string | null;
    }
  | { kind: "not_found" }
  // The lookup failed, or Wompi gave a status that is not documented. Nothing can be decided.
  | { kind: "unavailable" };

const STATUS_PRIORITY: readonly FinancialStatus[] = [
  "paid",
  "submitted",
  "failed",
];

/**
 * Reads the answer of `listTransactionsByReference`. An empty list or a 404 is "not found".
 * Our batches hold one transaction. If there are more, a paid one wins, then one that is in progress.
 */
export const readLookup = ([error, page]: Result<
  PayoutPage<PayoutTransaction>
>): Lookup => {
  if (error) {
    const notFound =
      ("type" in error && error.type === "NOT_FOUND_ERROR") ||
      ("statusCode" in error && error.statusCode === 404);
    return notFound ? { kind: "not_found" } : { kind: "unavailable" };
  }
  if (page.records.length === 0) {
    return { kind: "not_found" };
  }

  for (const status of STATUS_PRIORITY) {
    const record = page.records.find(
      (item) => statusFromWompiTransaction(item.status) === status
    );
    if (record) {
      return {
        kind: "found",
        status,
        providerPayoutId: record.payout?.id ?? null,
      };
    }
  }
  return { kind: "unavailable" };
};

export type ReconcileDecision =
  | { kind: "keep" }
  | { kind: "apply"; status: FinancialStatus }
  | { kind: "requeue" }
  | { kind: "review" };

/**
 * Decides what reconciliation does with an uncertain or a stale submitted payout.
 * Found: use the status from Wompi. Not found before `retryDeadline`: send again with the same key
 * (Wompi drops a repeated key in its 24-hour window). Not found after the deadline: staff decide.
 * An empty answer never allows a new send after the deadline.
 */
export const decideReconcile = ({
  status,
  lookup,
  now,
  retryDeadline,
}: {
  status: "uncertain" | "submitted";
  lookup: Lookup;
  now: Date;
  retryDeadline: Date | null;
}): ReconcileDecision => {
  if (lookup.kind === "unavailable") {
    return { kind: "keep" };
  }
  if (lookup.kind === "found") {
    return lookup.status === status
      ? { kind: "keep" }
      : { kind: "apply", status: lookup.status };
  }
  // Wompi accepted a submitted payout. A lookup that does not find it is not proof that it is missing.
  if (status === "submitted") {
    return { kind: "keep" };
  }
  if (retryDeadline !== null && now < retryDeadline) {
    return { kind: "requeue" };
  }
  return { kind: "review" };
};
