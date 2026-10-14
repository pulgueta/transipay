import type {
  CreatePayoutInput,
  CreatePayoutResult,
  PayoutPage,
  PayoutTransaction,
  Result,
} from "@pulgueta/wompi/schemas";

import type { Database } from "@/server/db/client";

/** The Wompi payouts API calls that the payout queue uses. `WompiPayoutsClient` has this shape. */
export interface PayoutsPort {
  createPayout: (
    input: CreatePayoutInput,
    options: { idempotencyKey: string }
  ) => Promise<Result<CreatePayoutResult>>;
  listTransactionsByReference: (
    reference: string
  ) => Promise<Result<PayoutPage<PayoutTransaction>>>;
}

export interface PayoutDeps {
  database: Database;
  payouts: PayoutsPort;
  /**
   * The Wompi origin account for a new payout. It is stored in the payout command, and a send uses the stored value.
   * When it is not set, a new payout cannot be created; the queued payouts are still sent.
   */
  originAccountId: string | undefined;
  /** The user for the audit log. Null for the gateway or a scheduler. */
  actorId: string | null;
}
