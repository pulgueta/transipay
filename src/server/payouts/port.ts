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
  /** The Wompi origin account. When it is not set, payouts stay queued. */
  originAccountId: string | undefined;
  /** The user for the audit log. Null for the gateway or a scheduler. */
  actorId: string | null;
}
