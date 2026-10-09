import type { PayoutStatus } from "@/server/db/schema/payments";

interface PayoutRequest {
  entityId: string;
  amountInCents: number;
}

interface StoredPayout extends PayoutRequest {
  status: PayoutStatus;
  providerPayoutId: string | null;
}

/**
 * Decides what a repeated payout request does when a payout with the same idempotency key exists.
 * "retry": Wompi did not confirm the payout, so send it again with the same key and reference.
 * "existing": return the stored payout. "conflict": the key belongs to another request.
 */
export const resolveExistingPayout = (
  existing: StoredPayout,
  request: PayoutRequest
) => {
  if (
    existing.entityId !== request.entityId ||
    existing.amountInCents !== request.amountInCents
  ) {
    return "conflict" as const;
  }
  return existing.status === "pending" && existing.providerPayoutId === null
    ? ("retry" as const)
    : ("existing" as const);
};
