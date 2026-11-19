import type { LinkProps } from "@tanstack/react-router";

import { sectionsFor } from "@/components/staff/sections";
import { canUser } from "@/lib/auth/permissions";
import type { Permissions } from "@/lib/auth/permissions";

export interface NavLink {
  to: LinkProps["to"];
  label: string;
}

/** The pages of a signed-in citizen, with the permission that each page needs. */
const CITIZEN_LINKS: (NavLink & { needs: Permissions })[] = [
  {
    to: "/obligations",
    label: "Obligaciones",
    needs: { obligation: ["read"] },
  },
  { to: "/appointments", label: "Citas", needs: { appointment: ["read"] } },
  { to: "/courses", label: "Cursos", needs: { course: ["read"] } },
];

const STAFF_LINK: NavLink = { to: "/staff", label: "Funcionarios" };

/** The citizen pages that the role can read. */
const readableLinks = (role: string | null | undefined): NavLink[] =>
  CITIZEN_LINKS.filter(({ needs }) => canUser(role, needs)).map(
    ({ to, label }) => ({ to, label })
  );

/**
 * The header links for the session. A link shows only when the role can read its page.
 * The Staff link shows only when the role can open a staff section.
 */
export const navLinksFor = (
  session: { user: { role?: string | null } } | null
): NavLink[] => {
  if (!session) {
    return [];
  }
  const { role } = session.user;
  const links = readableLinks(role);
  return sectionsFor(role).length > 0 ? [...links, STAFF_LINK] : links;
};

/**
 * The footer links. Before sign-in, every page shows (a private page opens the sign-in page).
 * After sign-in, a page shows only when the role can read it.
 */
export const footerLinksFor = (
  session: { user: { role?: string | null } } | null
): NavLink[] => [
  { to: "/", label: "Inicio" },
  ...(session
    ? readableLinks(session.user.role)
    : CITIZEN_LINKS.map(({ to, label }) => ({ to, label }))),
  { to: "/account", label: "Mi cuenta" },
];
