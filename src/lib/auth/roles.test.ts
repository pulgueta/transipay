import { describe, expect, it } from "vitest";

import { isStaff, roleNames } from "./roles";

describe(roleNames, () => {
  it("splits the comma-separated role column", () => {
    expect(roleNames("citizen,admin")).toStrictEqual(["citizen", "admin"]);
  });

  it("trims spaces and drops empty names", () => {
    expect(roleNames(" citizen , ,cashier ")).toStrictEqual([
      "citizen",
      "cashier",
    ]);
  });

  it("gives no names for a missing role", () => {
    expect(roleNames(null)).toStrictEqual([]);
    expect(roleNames()).toStrictEqual([]);
    expect(roleNames("")).toStrictEqual([]);
  });
});

describe(isStaff, () => {
  it.each(["cashier", "scheduler", "supervisor", "admin"])(
    "is true for %s",
    (role) => {
      expect(isStaff(role)).toBeTruthy();
    }
  );

  it("is true when one of the roles is a staff role", () => {
    expect(isStaff("citizen,scheduler")).toBeTruthy();
  });

  it("is false for a citizen", () => {
    expect(isStaff("citizen")).toBeFalsy();
  });

  it("is false for a missing or unknown role", () => {
    expect(isStaff(null)).toBeFalsy();
    expect(isStaff("staff")).toBeFalsy();
  });
});
