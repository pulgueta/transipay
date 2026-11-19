import type { LinkProps } from "@tanstack/react-router";

import { canUser } from "@/lib/auth/permissions";

/**
 * A link of the home page.
 * `sign-in` opens the sign-in page, then goes back to `redirect`.
 */
export type LandingAction =
  | { kind: "page"; label: string; to: LinkProps["to"] }
  | { kind: "sign-in"; label: string; redirect: string };

export interface LandingActions {
  /** The main action of the page. */
  primary: LandingAction;
  /** Null for a role that has no second action (for example, a cashier cannot book). */
  secondary: LandingAction | null;
  /** Null for a role that cannot read the courses. */
  courses: LandingAction | null;
}

const OBLIGATIONS_LABEL = "Consultar mis obligaciones";
const COURSES_LABEL = "Ver los cursos";

/**
 * The actions that the home page shows to the session.
 * Use it for navigation only. A route guard and `requirePermission` are the real checks.
 */
export const landingActionsFor = (
  session: { user: { role?: string | null } } | null
): LandingActions => {
  if (!session) {
    return {
      primary: {
        kind: "sign-in",
        label: OBLIGATIONS_LABEL,
        redirect: "/obligations",
      },
      secondary: { kind: "page", label: "Crear cuenta", to: "/sign-up" },
      courses: { kind: "sign-in", label: COURSES_LABEL, redirect: "/courses" },
    };
  }

  const { role } = session.user;
  return {
    primary: canUser(role, { obligation: ["read"] })
      ? { kind: "page", label: OBLIGATIONS_LABEL, to: "/obligations" }
      : { kind: "page", label: "Mi cuenta", to: "/account" },
    secondary: canUser(role, { appointment: ["create"] })
      ? { kind: "page", label: "Agendar una cita", to: "/appointments" }
      : null,
    courses: canUser(role, { course: ["read"] })
      ? { kind: "page", label: COURSES_LABEL, to: "/courses" }
      : null,
  };
};
