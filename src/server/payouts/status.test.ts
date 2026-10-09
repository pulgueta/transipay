import {
  WompiError,
  WompiNotFoundError,
  WompiPayoutApiError,
  WompiRequestError,
  WompiServiceUnavailableError,
  WompiValidationError,
} from "@pulgueta/wompi/schemas";
import { describe, expect, it } from "vitest";

import { isDefiniteRejection, resolvePayoutUpdate } from "./status";

describe(resolvePayoutUpdate, () => {
  it.each([
    ["TOTAL_PAYMENT", "paid"],
    ["REJECTED", "failed"],
    ["NOT_APPROVED", "failed"],
    ["AFE_REJECTED", "failed"],
    ["PENDING", "processing"],
    ["PENDING_APPROVAL", "processing"],
    ["AFE_ON_HOLD", "processing"],
    ["PARTIAL_PAYMENT", "processing"],
  ] as const)("maps %s to %s", (wompiStatus, status) => {
    expect(resolvePayoutUpdate("pending", wompiStatus)).toStrictEqual({
      kind: "applied",
      status,
    });
  });

  it("does nothing for an unknown status", () => {
    expect(resolvePayoutUpdate("processing", "SOMETHING_NEW")).toStrictEqual({
      kind: "unchanged",
    });
  });

  it("does nothing when the status does not change", () => {
    expect(resolvePayoutUpdate("processing", "PENDING")).toStrictEqual({
      kind: "unchanged",
    });
  });

  it.each(["paid", "failed"] as const)(
    "does nothing when the payout is already %s",
    (current) => {
      expect(resolvePayoutUpdate(current, "REJECTED")).toStrictEqual({
        kind: "unchanged",
      });
    }
  );
});

describe(isDefiniteRejection, () => {
  it.each([
    ["a 4xx request error", new WompiRequestError(400, {})],
    [
      "a payout API error",
      new WompiPayoutApiError(409, { code: "EXC_001", message: "Invalid" }),
    ],
    [
      "a validation error",
      new WompiValidationError({
        error: { type: "INPUT_VALIDATION_ERROR", messages: { amount: ["x"] } },
      }),
    ],
    [
      "a not-found error",
      new WompiNotFoundError({
        error: { type: "NOT_FOUND_ERROR", reason: "No account" },
      }),
    ],
  ])("is true for %s", (_name, error) => {
    expect(isDefiniteRejection(error)).toBeTruthy();
  });

  it.each([
    ["a network error or timeout", new WompiRequestError(0, "Network error")],
    ["a gateway error", new WompiServiceUnavailableError(503, null)],
    ["a 5xx request error", new WompiRequestError(500, {})],
    ["an invalid success response", new WompiError("Response validation")],
  ])("is false for %s, because the result is not known", (_name, error) => {
    expect(isDefiniteRejection(error)).toBeFalsy();
  });
});
