import type {
  CreatePayoutResult,
  Result,
  WompiErrorResult,
} from "@pulgueta/wompi/schemas";

import type { SubmissionCertainty } from "./status";

export type Submission =
  | { certainty: "accepted"; providerPayoutId: string }
  | { certainty: Exclude<SubmissionCertainty, "accepted"> };

/**
 * Payouts API error codes (HTTP 400) that refuse a batch before Wompi makes it.
 * Source: Wompi "Pagos a terceros: errores". EXC_002 business rule, EXC_008 no balance,
 * EXC_017 daily limit, EXC_018 plan limit, EXC_019 the account cannot pay.
 * EXC_022 (409, key already processed) is not here: it tells us that an earlier send exists.
 */
const REJECTION_CODES = new Set([
  "EXC_002",
  "EXC_008",
  "EXC_017",
  "EXC_018",
  "EXC_019",
]);

const isRejection = (error: WompiErrorResult) => {
  if (!("type" in error)) {
    return false;
  }
  if (error.type === "INPUT_VALIDATION_ERROR") {
    return true;
  }
  return (
    error.type === "PAYOUT_API_ERROR" &&
    error.statusCode === 400 &&
    REJECTION_CODES.has(error.code)
  );
};

/**
 * Tells if Wompi received a payout from the result of `createPayout`.
 * Accepted: a success with a payout id. Rejected: only an input validation error or a documented refusal.
 * Unknown: all other results (408, 409, 429, 5xx, network errors, timeouts, an invalid success body).
 * Wompi can have made the payout, so an unknown result must never cause a new send without reconciliation.
 */
export const classifySubmission = ([
  error,
  data,
]: Result<CreatePayoutResult>): Submission => {
  if (error === null) {
    return data.payoutId === ""
      ? { certainty: "unknown" }
      : { certainty: "accepted", providerPayoutId: data.payoutId };
  }
  return { certainty: isRejection(error) ? "rejected" : "unknown" };
};
