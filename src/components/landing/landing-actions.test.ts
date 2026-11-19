import { describe, expect, it } from "vitest";

import { landingActionsFor } from "./landing-actions";

const actionsOf = (role: string | null) =>
  landingActionsFor({ user: { role } });

describe(landingActionsFor, () => {
  it("sends a signed-out visitor to sign in, and back to the page that the action names", () => {
    expect(landingActionsFor(null)).toStrictEqual({
      primary: {
        kind: "sign-in",
        label: "Consultar mis obligaciones",
        redirect: "/obligations",
      },
      secondary: { kind: "page", label: "Crear cuenta", to: "/sign-up" },
      courses: {
        kind: "sign-in",
        label: "Ver los cursos",
        redirect: "/courses",
      },
    });
  });

  it("gives a citizen the obligations, the booking, and the courses", () => {
    expect(actionsOf("citizen")).toStrictEqual({
      primary: {
        kind: "page",
        label: "Consultar mis obligaciones",
        to: "/obligations",
      },
      secondary: {
        kind: "page",
        label: "Agendar una cita",
        to: "/appointments",
      },
      courses: { kind: "page", label: "Ver los cursos", to: "/courses" },
    });
  });

  it("does not give a cashier the booking or the courses", () => {
    // A cashier reads obligations and appointments, but cannot book and has no course permission.
    const actions = actionsOf("cashier");

    expect(actions.primary).toStrictEqual({
      kind: "page",
      label: "Consultar mis obligaciones",
      to: "/obligations",
    });
    expect(actions.secondary).toBeNull();
    expect(actions.courses).toBeNull();
  });

  it.each(["scheduler", "supervisor", "admin"])(
    "gives a %s the obligations, the booking, and the courses",
    (role) => {
      expect(actionsOf(role)).toStrictEqual(actionsOf("citizen"));
    }
  );

  it("gives only the account page to a role that it does not know", () => {
    expect(actionsOf("unknown")).toStrictEqual({
      primary: { kind: "page", label: "Mi cuenta", to: "/account" },
      secondary: null,
      courses: null,
    });
    expect(actionsOf(null)).toStrictEqual(actionsOf("unknown"));
  });
});
