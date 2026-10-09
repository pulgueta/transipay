import { describe, expect, it } from "vitest";

import { checkoutExpiresAt, findReusablePayment } from "./checkout";

const createdAt = new Date("2026-10-08T12:00:00.000Z");

const pending = {
  id: "0199c3a0-0000-7000-8000-000000000001",
  reference: "tp_0001",
  amountInCents: 4_000_000,
  createdAt,
};

describe(checkoutExpiresAt, () => {
  it("closes the checkout 30 minutes after the payment starts", () => {
    expect(checkoutExpiresAt(createdAt).toISOString()).toBe(
      "2026-10-08T12:30:00.000Z"
    );
  });
});

describe(findReusablePayment, () => {
  it("gives the same payment to a second tab while the first link is open", () => {
    const secondTab = new Date("2026-10-08T12:10:00.000Z");

    expect(findReusablePayment([pending], 4_000_000, secondTab)).toBe(pending);
  });

  it("starts a new payment when the first link expired", () => {
    const later = new Date("2026-10-08T12:30:00.000Z");

    expect(findReusablePayment([pending], 4_000_000, later)).toBeUndefined();
  });

  it("starts a new payment when the amount due changed", () => {
    const secondTab = new Date("2026-10-08T12:10:00.000Z");

    expect(
      findReusablePayment([pending], 3_000_000, secondTab)
    ).toBeUndefined();
  });

  it("starts a new payment when no payment is open", () => {
    const none: (typeof pending)[] = [];

    expect(findReusablePayment(none, 4_000_000, createdAt)).toBeUndefined();
  });
});
