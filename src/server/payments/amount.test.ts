import { describe, expect, it } from "vitest";

import { resolveAmountDue } from "./amount";

const obligation = {
  status: "pending",
  amountInCents: 5_000_000,
  discountInCents: 0,
} as const;

describe(resolveAmountDue, () => {
  it("returns the obligation amount minus the discount", () => {
    expect(
      resolveAmountDue({ ...obligation, discountInCents: 1_000_000 }, null)
    ).toStrictEqual({ ok: true, amountInCents: 4_000_000 });
  });

  it("returns the installment amount for an obligation in an agreement", () => {
    expect(
      resolveAmountDue(
        { ...obligation, status: "in_agreement" },
        {
          status: "pending",
          amountInCents: 1_250_000,
        }
      )
    ).toStrictEqual({ ok: true, amountInCents: 1_250_000 });
  });

  it("accepts an overdue installment", () => {
    expect(
      resolveAmountDue(
        { ...obligation, status: "in_agreement" },
        {
          status: "overdue",
          amountInCents: 1_250_000,
        }
      )
    ).toStrictEqual({ ok: true, amountInCents: 1_250_000 });
  });

  it.each(["paid", "void"] as const)(
    "rejects an obligation with status %s",
    (status) => {
      expect(resolveAmountDue({ ...obligation, status }, null)).toStrictEqual({
        ok: false,
        reason: "obligation_not_payable",
      });
    }
  );

  it("rejects an obligation in an agreement without an installment", () => {
    expect(
      resolveAmountDue({ ...obligation, status: "in_agreement" }, null)
    ).toStrictEqual({ ok: false, reason: "installment_required" });
  });

  it("rejects an installment for an obligation without an agreement", () => {
    expect(
      resolveAmountDue(obligation, { status: "pending", amountInCents: 100 })
    ).toStrictEqual({ ok: false, reason: "installment_not_allowed" });
  });

  it("rejects an installment that is paid", () => {
    expect(
      resolveAmountDue(
        { ...obligation, status: "in_agreement" },
        {
          status: "paid",
          amountInCents: 1_250_000,
        }
      )
    ).toStrictEqual({ ok: false, reason: "installment_not_payable" });
  });

  it("rejects an obligation when the discount covers the full amount", () => {
    expect(
      resolveAmountDue(
        { ...obligation, discountInCents: obligation.amountInCents },
        null
      )
    ).toStrictEqual({ ok: false, reason: "nothing_due" });
  });
});
