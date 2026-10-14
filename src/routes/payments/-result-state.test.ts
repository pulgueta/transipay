import { describe, expect, it } from "vitest";

import { resolveResultState } from "./-result-state";

describe(resolveResultState, () => {
  it("shows the review state for an approved payment that staff must examine", () => {
    expect(
      resolveResultState({
        status: "approved",
        needsReview: true,
        checkoutExpired: false,
        attemptCount: 1,
      })
    ).toBe("review");
  });

  it("shows the approved state when no attempt waits for staff", () => {
    expect(
      resolveResultState({
        status: "approved",
        needsReview: false,
        checkoutExpired: false,
        attemptCount: 1,
      })
    ).toBe("approved");
  });

  it("shows the expired state for a pending payment whose link expired with no transaction", () => {
    expect(
      resolveResultState({
        status: "pending",
        needsReview: false,
        checkoutExpired: true,
        attemptCount: 0,
      })
    ).toBe("expired");
  });

  it("keeps the pending state when a transaction exists after the link expired", () => {
    expect(
      resolveResultState({
        status: "pending",
        needsReview: false,
        checkoutExpired: true,
        attemptCount: 1,
      })
    ).toBe("pending");
  });

  it("keeps the pending state while the link is open", () => {
    expect(
      resolveResultState({
        status: "pending",
        needsReview: false,
        checkoutExpired: false,
        attemptCount: 0,
      })
    ).toBe("pending");
  });

  it("shows the expired state for a payment that reconciliation closed", () => {
    expect(
      resolveResultState({
        status: "expired",
        needsReview: false,
        checkoutExpired: true,
        attemptCount: 0,
      })
    ).toBe("expired");
  });
});
