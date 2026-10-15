import { describe, expect, it } from "vitest";

import { resolveStaffScope } from "./scope";

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
