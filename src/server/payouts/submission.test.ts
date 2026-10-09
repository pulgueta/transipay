import type {
  CreatePayoutResult,
  Result,
  WompiErrorResult,
} from "@pulgueta/wompi/schemas";
import {
  WompiError,
  WompiNotFoundError,
  WompiPayoutApiError,
  WompiRequestError,
  WompiServiceUnavailableError,
  WompiValidationError,
} from "@pulgueta/wompi/schemas";
import { describe, expect, it } from "vitest";

import { classifySubmission } from "./submission";

const failure = (error: WompiErrorResult): Result<CreatePayoutResult> => [
  error,
  null,
];

const payoutApiError = (statusCode: number, code: string) =>
  new WompiPayoutApiError(statusCode, { code, message: code });

describe(classifySubmission, () => {
  it("is accepted for a success with a payout id", () => {
    expect(classifySubmission([null, { payoutId: "po_1" }])).toStrictEqual({
      certainty: "accepted",
      providerPayoutId: "po_1",
    });
  });

  it("is unknown for a success without a payout id", () => {
    expect(classifySubmission([null, { payoutId: "" }])).toStrictEqual({
      certainty: "unknown",
    });
  });

  it.each([
    [
      "an input validation error",
      new WompiValidationError({
        error: { type: "INPUT_VALIDATION_ERROR", messages: { amount: ["x"] } },
      }),
    ],
    ["a business rule error (EXC_002)", payoutApiError(400, "EXC_002")],
    ["no balance (EXC_008)", payoutApiError(400, "EXC_008")],
    ["the daily limit (EXC_017)", payoutApiError(400, "EXC_017")],
    ["the plan limit (EXC_018)", payoutApiError(400, "EXC_018")],
    ["an account that cannot pay (EXC_019)", payoutApiError(400, "EXC_019")],
  ])("is rejected for %s", (_name, error) => {
    expect(classifySubmission(failure(error))).toStrictEqual({
      certainty: "rejected",
    });
  });

  it.each([
    ["a timeout (408)", new WompiRequestError(408, {})],
    ["a used idempotency key (409, EXC_022)", payoutApiError(409, "EXC_022")],
    ["a conflict (409)", new WompiRequestError(409, {})],
    ["too many requests (429)", new WompiRequestError(429, {})],
    ["a server error (500, EXC_001)", payoutApiError(500, "EXC_001")],
    ["a 5xx request error", new WompiRequestError(500, {})],
    ["a gateway error", new WompiServiceUnavailableError(503, null)],
    ["a network error or timeout", new WompiRequestError(0, "Network error")],
    ["a 400 with a code that is not documented", payoutApiError(400, "X")],
    ["a 400 without a code", new WompiRequestError(400, {})],
    ["an authentication error", new WompiRequestError(401, {})],
    [
      "a not-found error",
      new WompiNotFoundError({
        error: { type: "NOT_FOUND_ERROR", reason: "No account" },
      }),
    ],
    ["an SDK error, such as an invalid success body", new WompiError("x")],
  ])("is unknown for %s", (_name, error) => {
    expect(classifySubmission(failure(error))).toStrictEqual({
      certainty: "unknown",
    });
  });
});
