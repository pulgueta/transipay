import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import {
  isAccessDenied,
  requirePermissions,
  requireSession,
  sanitizeRedirect,
} from "./guards";

const session = { user: { id: "u1" } };

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

describe(requireSession, () => {
  it("returns the session when there is one", () => {
    expect(requireSession(session, "/account")).toBe(session);
  });

  it("redirects a signed-out user to sign-in and keeps the page to go back to", () => {
    const thrown = catchRedirect(() => {
      requireSession(null, "/account?tab=1");
    });

    expect(thrown.status).toBe(307);
    expect(thrown.options).toMatchObject({
      to: "/sign-in",
      search: { redirect: "/account?tab=1" },
    });
  });

  it("does not send the user back to another site", () => {
    const thrown = catchRedirect(() => {
      requireSession(null, "https://evil.example/x");
    });

    expect(thrown.options).toMatchObject({ search: { redirect: "/" } });
  });
});

describe(sanitizeRedirect, () => {
  it("keeps a path in the app", () => {
    expect(sanitizeRedirect("/obligations")).toBe("/obligations");
  });

  it.each([
    undefined,
    "",
    "obligations",
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
  ])("replaces %j with the home page", (value) => {
    expect(sanitizeRedirect(value)).toBe("/");
  });
});

describe(requirePermissions, () => {
  it("does nothing when the role has the permissions", () => {
    expect(() => {
      requirePermissions("citizen", { course: ["read"] });
    }).not.toThrow();
  });

  it("redirects to the home page when the role does not have the permissions", () => {
    const thrown = catchRedirect(() => {
      requirePermissions("cashier", { course: ["read"] });
    });

    expect(thrown.options).toMatchObject({ to: "/", replace: true });
  });
});

describe(isAccessDenied, () => {
  it("is true for the 403 message of a server function", () => {
    expect(
      isAccessDenied(new Error("No tiene permiso para hacer esta operación."))
    ).toBeTruthy();
  });

  it("is false for a different error", () => {
    expect(isAccessDenied(new Error("Ocurrió otro error."))).toBeFalsy();
  });
});
