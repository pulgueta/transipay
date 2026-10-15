import type { LinkProps } from "@tanstack/react-router";

import { sectionsFor } from "@/components/staff/sections";

export interface NavLink {
  to: LinkProps["to"];
  label: string;
}

/** The pages of a signed-in citizen. */
const CITIZEN_LINKS: NavLink[] = [
  { to: "/obligations", label: "Obligations" },
  { to: "/appointments", label: "Appointments" },
  { to: "/courses", label: "Courses" },
];

const STAFF_LINK: NavLink = { to: "/staff", label: "Staff" };

/** The header links for the session. The Staff link shows only when the role can open a staff section. */
export const navLinksFor = (
  session: { user: { role?: string | null } } | null
): NavLink[] => {
  if (!session) {
    return [];
  }
  return sectionsFor(session.user.role).length > 0
    ? [...CITIZEN_LINKS, STAFF_LINK]
    : [...CITIZEN_LINKS];
};
