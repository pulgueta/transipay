import { describe, expect, it } from "vitest";

import { resolveExistingPayout } from "./idempotency";

const request = {
  entityId: "0199c3a0-0000-7000-8000-000000000001",
  amountInCents: 5_000_000,
};

const existing = { ...request, status: "queued" as const };

describe(resolveExistingPayout, () => {
  it("dispatches a queued payout, because no send started", () => {
    expect(resolveExistingPayout(existing, request)).toBe("dispatch");
  });

  it.each([
    "draft",
    "submitting",
    "submitted",
    "uncertain",
    "paid",
    "failed",
  ] as const)("returns a %s payout without a new send", (status) => {
    expect(resolveExistingPayout({ ...existing, status }, request)).toBe(
      "existing"
    );
  });

  it("refuses a key that another payout request used", () => {
    expect(
      resolveExistingPayout(existing, { ...request, amountInCents: 1000 })
    ).toBe("conflict");
    expect(
      resolveExistingPayout(existing, {
        ...request,
        entityId: "0199c3a0-0000-7000-8000-000000000002",
      })
    ).toBe("conflict");
  });
});
