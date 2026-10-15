import { describe, expect, it } from "vitest";

import { isInScope, resolveStaffScope } from "./scope";

describe(resolveStaffScope, () => {
  it("gives the admin every entity", () => {
    expect(resolveStaffScope("admin", [])).toStrictEqual({ kind: "all" });
    expect(resolveStaffScope("citizen,admin", ["e1"])).toStrictEqual({
      kind: "all",
    });
  });

  it("limits other staff to the entities of their memberships", () => {
    expect(resolveStaffScope("scheduler", ["e1", "e2"])).toStrictEqual({
      kind: "entities",
      entityIds: ["e1", "e2"],
    });
    expect(resolveStaffScope("supervisor", [])).toStrictEqual({
      kind: "entities",
      entityIds: [],
    });
  });
});

describe(isInScope, () => {
  it("accepts every entity for the admin scope", () => {
    expect(isInScope({ kind: "all" }, "e9")).toBeTruthy();
  });

  it("accepts only the entities of the memberships", () => {
    const scope = { kind: "entities" as const, entityIds: ["e1", "e2"] };
    expect(isInScope(scope, "e2")).toBeTruthy();
    expect(isInScope(scope, "e9")).toBeFalsy();
    expect(isInScope({ kind: "entities", entityIds: [] }, "e1")).toBeFalsy();
  });
});
