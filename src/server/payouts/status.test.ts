import { describe, expect, it } from "vitest";

import {
  resolvePayoutUpdate,
  statusAfterSubmission,
  statusFromWompiPayout,
  statusFromWompiTransaction,
} from "./status";

describe(statusFromWompiPayout, () => {
  it.each([
    ["TOTAL_PAYMENT", "paid"],
    ["REJECTED", "failed"],
    ["NOT_APPROVED", "failed"],
    ["AFE_REJECTED", "failed"],
    ["PENDING", "submitted"],
    ["PENDING_APPROVAL", "submitted"],
    ["AFE_ON_HOLD", "submitted"],
    ["PARTIAL_PAYMENT", "submitted"],
  ] as const)("maps the batch status %s to %s", (wompiStatus, status) => {
    expect(statusFromWompiPayout(wompiStatus)).toBe(status);
  });

  it("gives no status for a status that is not documented", () => {
    expect(statusFromWompiPayout("SOMETHING_NEW")).toBeUndefined();
  });
});

describe(statusFromWompiTransaction, () => {
  it.each([
    ["APPROVED", "paid"],
    ["REJECTED", "failed"],
    ["FAILED", "failed"],
    ["CANCELLED", "failed"],
    ["PENDING", "submitted"],
    ["PROCESSING", "submitted"],
    ["READY_TO_FILE", "submitted"],
    ["ADDED_TO_FILE", "submitted"],
  ] as const)("maps the transaction status %s to %s", (wompiStatus, status) => {
    expect(statusFromWompiTransaction(wompiStatus)).toBe(status);
  });

  it("gives no status for a status that is not documented", () => {
    expect(statusFromWompiTransaction("SOMETHING_NEW")).toBeUndefined();
  });
});

describe(resolvePayoutUpdate, () => {
  it.each([
    ["queued", "submitted"],
    ["submitting", "submitted"],
    ["submitting", "paid"],
    ["uncertain", "submitted"],
    ["uncertain", "paid"],
    ["uncertain", "failed"],
    ["submitted", "paid"],
    ["submitted", "failed"],
  ] as const)("moves a %s payout to %s", (current, target) => {
    expect(resolvePayoutUpdate(current, target)).toStrictEqual({
      kind: "applied",
      status: target,
    });
  });

  it.each([
    ["submitted", "submitted"],
    ["paid", "failed"],
    ["paid", "submitted"],
    ["failed", "submitted"],
    ["failed", "failed"],
    ["draft", "paid"],
  ] as const)("does not change a %s payout to %s", (current, target) => {
    expect(resolvePayoutUpdate(current, target)).toStrictEqual({
      kind: "unchanged",
    });
  });

  it("marks a failed payout as paid, because Wompi moved the money", () => {
    expect(resolvePayoutUpdate("failed", "paid")).toStrictEqual({
      kind: "applied",
      status: "paid",
    });
  });
});

describe(statusAfterSubmission, () => {
  it("moves an accepted payout to submitted", () => {
    expect(statusAfterSubmission("accepted", { firstDispatch: true })).toBe(
      "submitted"
    );
  });

  it("moves a payout that Wompi rejected on the first send to failed", () => {
    expect(statusAfterSubmission("rejected", { firstDispatch: true })).toBe(
      "failed"
    );
  });

  it("moves a rejection on a later send to uncertain, because an earlier send can exist", () => {
    expect(statusAfterSubmission("rejected", { firstDispatch: false })).toBe(
      "uncertain"
    );
  });

  it.each([true, false])(
    "moves an unknown result to uncertain (first send: %s)",
    (firstDispatch) => {
      expect(statusAfterSubmission("unknown", { firstDispatch })).toBe(
        "uncertain"
      );
    }
  );
});
