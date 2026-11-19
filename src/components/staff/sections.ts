import {
  IconCalendarEvent,
  IconCreditCard,
  IconFileInvoice,
  IconSend,
  IconUsers,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import { redirect } from "@tanstack/react-router";

import { canUser } from "@/lib/auth/permissions";
import type { Permissions } from "@/lib/auth/permissions";

export interface StaffSection {
  to: string;
  label: string;
  icon: Icon;
}

interface SectionRule extends StaffSection {
  /** One of these permission sets is enough to see the section. */
  anyOf: Permissions[];
}

/** The staff sections, in sidebar order. */
const SECTIONS: SectionRule[] = [
  {
    to: "/staff/users",
    label: "Usuarios",
    icon: IconUsers,
    anyOf: [{ user: ["list"] }],
  },
  {
    to: "/staff/payouts",
    label: "Dispersiones",
    icon: IconSend,
    anyOf: [{ payout: ["read"] }],
  },
  {
    to: "/staff/payments",
    label: "Pagos",
    icon: IconCreditCard,
    anyOf: [{ payment: ["review"] }],
  },
  {
    to: "/staff/obligations",
    label: "Obligaciones",
    icon: IconFileInvoice,
    anyOf: [{ obligation: ["create"] }],
  },
  {
    to: "/staff/schedule",
    label: "Agenda",
    icon: IconCalendarEvent,
    anyOf: [{ appointment: ["update"] }, { course: ["create"] }],
  },
];

/** The sections that the role can open. The first one is the landing page of `/staff`. */
export const sectionsFor = (role: string | null | undefined): StaffSection[] =>
  SECTIONS.filter(({ anyOf }) =>
    anyOf.some((permissions) => canUser(role, permissions))
  ).map(({ to, label, icon }) => ({ to, label, icon }));

/**
 * False when the path is a staff section (or a page in it) that the role cannot open.
 * True for a path that is not a section. Use it for navigation only. The server checks permissions.
 */
export const canOpenSection = (
  role: string | null | undefined,
  pathname: string
): boolean => {
  const section = SECTIONS.find(
    ({ to }) => pathname === to || pathname.startsWith(`${to}/`)
  );
  return (
    section === undefined ||
    section.anyOf.some((permissions) => canUser(role, permissions))
  );
};

/**
 * Use it in the `beforeLoad` of a staff section route. When the role cannot open the section,
 * it sends the user to the first section that the role can open, or to the home page when there is none.
 * The page then does not load data or show controls that the server refuses.
 */
export const requireSection = (
  role: string | null | undefined,
  pathname: string
): void => {
  if (!canOpenSection(role, pathname)) {
    const first = sectionsFor(role).at(0);
    redirect({ to: first?.to ?? "/", replace: true, throw: true });
  }
};
