import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/** Shared by the server and the client. It holds no secrets. */
export const statement = {
  ...defaultStatements,
  obligation: ["read", "create", "update", "void"],
  payment: ["read", "create", "refund"],
  appointment: ["read", "create", "update", "cancel"],
  course: ["read", "create", "update", "enroll"],
  payout: ["read", "create"],
  audit: ["read"],
  entity: ["read", "create", "update"],
} as const;

export const ac = createAccessControl(statement);

/** Default role at sign-up. Server code must also limit a citizen to their own records. */
export const citizen = ac.newRole({
  obligation: ["read"],
  payment: ["read", "create"],
  appointment: ["read", "create", "cancel"],
  course: ["read", "enroll"],
});

export const cashier = ac.newRole({
  obligation: ["read"],
  payment: ["read", "create"],
  appointment: ["read"],
});

export const scheduler = ac.newRole({
  obligation: ["read"],
  appointment: ["read", "create", "update", "cancel"],
  course: ["read", "create", "update", "enroll"],
});

export const supervisor = ac.newRole({
  obligation: ["read", "create", "update", "void"],
  payment: ["read", "create", "refund"],
  appointment: ["read", "create", "update", "cancel"],
  course: ["read", "create", "update", "enroll"],
  payout: ["read"],
  audit: ["read"],
  entity: ["read"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  obligation: ["read", "create", "update", "void"],
  payment: ["read", "create", "refund"],
  appointment: ["read", "create", "update", "cancel"],
  course: ["read", "create", "update", "enroll"],
  payout: ["read", "create"],
  audit: ["read"],
  entity: ["read", "create", "update"],
});

export const roles = { citizen, cashier, scheduler, supervisor, admin };

export type Role = keyof typeof roles;

/** Permissions that a server function can ask for, for example `{ payment: ["refund"] }`. */
export type Permissions = {
  [Resource in keyof typeof statement]?: (typeof statement)[Resource][number][];
};
