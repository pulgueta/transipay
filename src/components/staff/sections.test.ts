import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { canOpenSection, requireSection, sectionsFor } from "./sections";

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

describe(canOpenSection, () => {
  it("lets a role open a section that it can see", () => {
    expect(canOpenSection("admin", "/staff/obligations")).toBeTruthy();
    expect(canOpenSection("scheduler", "/staff/schedule")).toBeTruthy();
  });

  it.each([
    ["cashier", "/staff/obligations"],
    ["scheduler", "/staff/obligations"],
    ["cashier", "/staff/schedule"],
    ["supervisor", "/staff/users"],
    ["scheduler", "/staff/payouts/"],
  ])("does not let a %s open %s", (role, pathname) => {
    expect(canOpenSection(role, pathname)).toBeFalsy();
  });

  it("does not decide for a path that is not a section", () => {
    expect(canOpenSection("cashier", "/staff")).toBeTruthy();
    expect(canOpenSection("cashier", "/staff/usersx")).toBeTruthy();
  });
});

/** Runs `fn` and returns the redirect that it throws. */
const catchRedirect = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    if (isRedirect(error)) {
      return error;
    }
    throw error;
  }
  throw new Error("The function did not throw.");
};

describe(requireSection, () => {
  it("does nothing when the role can open the section", () => {
    expect(() => {
      requireSection("scheduler", "/staff/schedule");
    }).not.toThrow();
  });

  it("redirects to the first section that the role can open", () => {
    const thrown = catchRedirect(() => {
      requireSection("scheduler", "/staff/obligations");
    });

    expect(thrown.options).toMatchObject({
      to: "/staff/schedule",
      replace: true,
    });
  });

  it("redirects to the home page when the role has no section", () => {
    const thrown = catchRedirect(() => {
      requireSection("cashier", "/staff/payments");
    });

    expect(thrown.options).toMatchObject({ to: "/", replace: true });
  });
});
