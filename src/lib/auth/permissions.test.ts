import { describe, expect, it } from "vitest";

import { canUser } from "./permissions";
import type { Permissions } from "./permissions";

describe(canUser, () => {
  it.each<Permissions>([
    { user: ["list"] },
    { payout: ["read"] },
    { payment: ["review"] },
    { obligation: ["create"] },
    { appointment: ["update"] },
    { course: ["create"] },
  ])("is false for a citizen on the staff permission %o", (permissions) => {
    expect(canUser("citizen", permissions)).toBeFalsy();
  });

  it("gives the supervisor and the admin the payment review permission", () => {
    expect(canUser("supervisor", { payment: ["review"] })).toBeTruthy();
    expect(canUser("admin", { payment: ["review"] })).toBeTruthy();
    expect(canUser("cashier", { payment: ["review"] })).toBeFalsy();
  });

  it("needs all the permissions in the request", () => {
    expect(canUser("supervisor", { payout: ["read"] })).toBeTruthy();
    expect(canUser("supervisor", { payout: ["read", "create"] })).toBeFalsy();
  });

  it("is true when one of the comma-separated roles has the permission", () => {
    expect(canUser("citizen,scheduler", { course: ["create"] })).toBeTruthy();
  });

  it("is false for a missing or unknown role", () => {
    expect(canUser(null, { obligation: ["read"] })).toBeFalsy();
    expect(canUser("staff", { obligation: ["read"] })).toBeFalsy();
  });
});
