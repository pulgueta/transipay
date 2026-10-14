import type { PayoutStatus } from "@/server/db/schema/payments";

interface PayoutRequest {
  entityId: string;
  amountInCents: number;
}

interface StoredPayout extends PayoutRequest {
  status: PayoutStatus;
}

/**
 * Decides what a repeated payout request does when a payout with the same idempotency key exists.
 * "dispatch": the payout is queued and no send started, so send it from its stored command.
 * "existing": return the stored payout. An uncertain payout is not sent again: only reconciliation can do that.
 * "conflict": the key belongs to another request.
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
  return existing.status === "queued"
    ? ("dispatch" as const)
    : ("existing" as const);
};
