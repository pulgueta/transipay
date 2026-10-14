import { describe, expect, it } from "vitest";

import { canStillSettle, checkoutExpiresAt, decideCheckout } from "./checkout";

const createdAt = new Date("2026-10-08T12:00:00.000Z");
const whileOpen = new Date("2026-10-08T12:10:00.000Z");
const afterExpiry = new Date("2026-10-08T12:30:00.000Z");

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

describe(canStillSettle, () => {
  const oneDayLater = new Date("2026-10-09T12:00:00.000Z");

  it("lets a pending payment settle at any time", () => {
    expect(
      canStillSettle({ status: "pending", createdAt }, oneDayLater)
    ).toBeTruthy();
  });

  it("lets a declined payment settle inside the window after the checkout started", () => {
    expect(
      canStillSettle({ status: "declined", createdAt }, afterExpiry)
    ).toBeTruthy();
  });

  it("does not let a declined payment settle after the window", () => {
    expect(
      canStillSettle({ status: "declined", createdAt }, oneDayLater)
    ).toBeFalsy();
  });

  it("never reconciles an approved payment before a checkout", () => {
    expect(
      canStillSettle({ status: "approved", createdAt }, whileOpen)
    ).toBeFalsy();
  });
});

describe(decideCheckout, () => {
  it("gives the same payment to a second tab while the first link is open", () => {
    expect(
      decideCheckout({
        open: [pending],
        hasPendingTransaction: false,
        amountInCents: 4_000_000,
        now: whileOpen,
      })
    ).toStrictEqual({ kind: "reuse", payment: pending });
  });

  it("starts a new payment when no payment is open", () => {
    const none: (typeof pending)[] = [];

    expect(
      decideCheckout({
        open: none,
        hasPendingTransaction: false,
        amountInCents: 4_000_000,
        now: whileOpen,
      })
    ).toStrictEqual({ kind: "create" });
  });

  it("starts a new payment when the earlier link expired without a transaction", () => {
    expect(
      decideCheckout({
        open: [pending],
        hasPendingTransaction: false,
        amountInCents: 3_000_000,
        now: afterExpiry,
      })
    ).toStrictEqual({ kind: "create" });
  });

  it("refuses while a Wompi transaction for this target is in progress", () => {
    expect(
      decideCheckout({
        open: [pending],
        hasPendingTransaction: true,
        amountInCents: 4_000_000,
        now: whileOpen,
      })
    ).toStrictEqual({ kind: "in_progress" });
  });

  it("refuses until an open link for a different amount expires", () => {
    const later = { ...pending, createdAt: new Date("2026-10-08T12:05:00Z") };

    expect(
      decideCheckout({
        open: [later, pending],
        hasPendingTransaction: false,
        amountInCents: 3_000_000,
        now: whileOpen,
      })
    ).toStrictEqual({
      kind: "wait",
      until: new Date("2026-10-08T12:35:00.000Z"),
    });
  });
});
