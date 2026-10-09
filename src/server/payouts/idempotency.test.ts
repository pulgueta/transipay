import { describe, expect, it } from "vitest";

import { resolveExistingPayout } from "./idempotency";

const request = {
  entityId: "0199c3a0-0000-7000-8000-000000000001",
  amountInCents: 5_000_000,
};

const existing = {
  ...request,
  status: "pending" as const,
  providerPayoutId: null,
};

describe(resolveExistingPayout, () => {
  it("sends the payout again when Wompi has not confirmed it", () => {
    expect(resolveExistingPayout(existing, request)).toBe("retry");
  });

  it("returns the payout when Wompi has its id", () => {
    expect(
      resolveExistingPayout({ ...existing, providerPayoutId: "po_1" }, request)
    ).toBe("existing");
  });

  it.each(["processing", "paid", "failed"] as const)(
    "returns a %s payout without a new Wompi call",
    (status) => {
      expect(resolveExistingPayout({ ...existing, status }, request)).toBe(
        "existing"
      );
    }
  );

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
