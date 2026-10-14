import { describe, expect, it } from "vitest";

import { canReadPayment } from "./access";

describe(canReadPayment, () => {
  it("lets the owner citizen read the payment", () => {
    expect(canReadPayment({ isOwner: true, role: "citizen" })).toBeTruthy();
  });

  it("refuses a citizen who is not the owner", () => {
    expect(canReadPayment({ isOwner: false, role: "citizen" })).toBeFalsy();
  });

  it.each(["cashier", "supervisor", "admin", "citizen,cashier"])(
    "lets staff with payment:read (%s) read any payment",
    (role) => {
      expect(canReadPayment({ isOwner: false, role })).toBeTruthy();
    }
  );

  it.each(["scheduler", "unknown", null, undefined])(
    "refuses a user without payment:read as staff (%s)",
    (role) => {
      expect(canReadPayment({ isOwner: false, role })).toBeFalsy();
    }
  );
});
