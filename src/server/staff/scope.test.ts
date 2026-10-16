import { describe, expect, it } from "vitest";

import { entitiesAllowing, entityRoleAllows, resolveStaffScope } from "./scope";
import type { StaffScope } from "./scope";

const scope: StaffScope = {
  kind: "entities",
  memberships: [
    { entityId: "a", role: "supervisor" },
    { entityId: "b", role: "cashier" },
    { entityId: "c", role: "instructor" },
    { entityId: "d", role: "admin" },
  ],
};

describe(resolveStaffScope, () => {
  it("gives the admin every entity", () => {
    expect(resolveStaffScope("admin", [])).toStrictEqual({ kind: "all" });
    expect(
      resolveStaffScope("citizen,admin", [{ entityId: "e1", role: "cashier" }])
    ).toStrictEqual({ kind: "all" });
  });

  it("limits other staff to their memberships, with the role in each entity", () => {
    expect(
      resolveStaffScope("scheduler", [{ entityId: "e1", role: "scheduler" }])
    ).toStrictEqual({
      kind: "entities",
      memberships: [{ entityId: "e1", role: "scheduler" }],
    });
    expect(resolveStaffScope("supervisor", [])).toStrictEqual({
      kind: "entities",
      memberships: [],
    });
  });
});

describe(entityRoleAllows, () => {
  it("accepts every entity and permission for the admin scope", () => {
    expect(
      entityRoleAllows({ kind: "all" }, "e9", { payout: ["create"] })
    ).toBeTruthy();
  });

  it("checks the role of the membership for the entity, not another membership", () => {
    expect(
      entityRoleAllows(scope, "a", { obligation: ["create"] })
    ).toBeTruthy();
    expect(
      entityRoleAllows(scope, "b", { obligation: ["create"] })
    ).toBeFalsy();
    expect(entityRoleAllows(scope, "b", { payment: ["create"] })).toBeTruthy();
    expect(entityRoleAllows(scope, "d", { payout: ["create"] })).toBeTruthy();
    expect(entityRoleAllows(scope, "z", { obligation: ["read"] })).toBeFalsy();
  });

  it("refuses a role that has no permission set", () => {
    expect(entityRoleAllows(scope, "c", { course: ["read"] })).toBeFalsy();
  });
});

describe(entitiesAllowing, () => {
  it("gives null for the admin scope, because the admin has all entities", () => {
    expect(entitiesAllowing({ kind: "all" }, { course: ["read"] })).toBeNull();
  });

  it("gives only the entities where the role has the permissions", () => {
    expect(entitiesAllowing(scope, { obligation: ["create"] })).toStrictEqual([
      "a",
      "d",
    ]);
    expect(entitiesAllowing(scope, { payout: ["create"] })).toStrictEqual([
      "d",
    ]);
  });
});
