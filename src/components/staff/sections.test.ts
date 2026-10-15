import { describe, expect, it } from "vitest";

import { sectionsFor } from "./sections";

const paths = (role: string | null) =>
  sectionsFor(role).map((section) => section.to);

describe(sectionsFor, () => {
  it("shows every section to the admin, in the sidebar order", () => {
    expect(paths("admin")).toStrictEqual([
      "/staff/users",
      "/staff/payouts",
      "/staff/payments",
      "/staff/obligations",
      "/staff/schedule",
    ]);
  });

  it("hides the users section from a supervisor", () => {
    expect(paths("supervisor")).toStrictEqual([
      "/staff/payouts",
      "/staff/payments",
      "/staff/obligations",
      "/staff/schedule",
    ]);
  });

  it("shows only the schedule to a scheduler", () => {
    expect(paths("scheduler")).toStrictEqual(["/staff/schedule"]);
  });

  it("shows nothing to a cashier or a citizen", () => {
    expect(paths("cashier")).toStrictEqual([]);
    expect(paths("citizen")).toStrictEqual([]);
    expect(paths(null)).toStrictEqual([]);
  });

  it("joins the sections of a comma-separated role", () => {
    expect(paths("citizen,scheduler")).toStrictEqual(["/staff/schedule"]);
  });
});
