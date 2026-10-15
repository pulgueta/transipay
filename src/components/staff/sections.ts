import {
  IconCalendarEvent,
  IconCreditCard,
  IconFileInvoice,
  IconSend,
  IconUsers,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";

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
    label: "Users",
    icon: IconUsers,
    anyOf: [{ user: ["list"] }],
  },
  {
    to: "/staff/payouts",
    label: "Payouts",
    icon: IconSend,
    anyOf: [{ payout: ["read"] }],
  },
  {
    to: "/staff/payments",
    label: "Payments",
    icon: IconCreditCard,
    anyOf: [{ payment: ["review"] }],
  },
  {
    to: "/staff/obligations",
    label: "Obligations",
    icon: IconFileInvoice,
    anyOf: [{ obligation: ["create"] }],
  },
  {
    to: "/staff/schedule",
    label: "Schedule",
    icon: IconCalendarEvent,
    anyOf: [{ appointment: ["update"] }, { course: ["create"] }],
  },
];

/** The sections that the role can open. The first one is the landing page of `/staff`. */
export const sectionsFor = (role: string | null | undefined): StaffSection[] =>
  SECTIONS.filter(({ anyOf }) =>
    anyOf.some((permissions) => canUser(role, permissions))
  ).map(({ to, label, icon }) => ({ to, label, icon }));
