import "@tanstack/react-start/server-only";
import { eq, inArray } from "drizzle-orm";
import type { Column } from "drizzle-orm";

import { isRole, roles } from "@/lib/auth/permissions";
import type { Permissions } from "@/lib/auth/permissions";
import { roleNames } from "@/lib/auth/roles";
import type { Database } from "@/server/db/client";
import { staffMember } from "@/server/db/schema/entities";
import type { StaffRole } from "@/server/db/schema/entities";

/** One `staff_member` row: the role of the user inside one entity. */
export interface StaffMembership {
  entityId: string;
  role: StaffRole;
}

/** The entities that a staff member can work with, with the role in each one. The admin sees all of them. */
export type StaffScope =
  | { kind: "all" }
  | { kind: "entities"; memberships: StaffMembership[] };

/** Decides the scope from the platform role and the entity memberships (`staff_member`). */
export const resolveStaffScope = (
  role: string | null | undefined,
  memberships: StaffMembership[]
): StaffScope =>
  roleNames(role).includes("admin")
    ? { kind: "all" }
    : { kind: "entities", memberships };

/** Reads the memberships of the user, with their roles, and resolves the scope. */
export const staffScopeFor = async (
  database: Database,
  user: { id: string; role?: string | null }
): Promise<StaffScope> => {
  if (roleNames(user.role).includes("admin")) {
    return { kind: "all" };
  }
  const memberships = await database
    .select({ entityId: staffMember.entityId, role: staffMember.role })
    .from(staffMember)
    .where(eq(staffMember.userId, user.id));
  return resolveStaffScope(user.role, memberships);
};

/** True when the entity role has all the permissions. A role with no permission set (`instructor`) has none. */
const roleAllows = (role: string, permissions: Permissions) =>
  isRole(role) && roles[role].authorize(permissions).success;

/**
 * True when the role of the user in the entity has all the permissions. The admin scope allows all.
 * The platform role (`requirePermission`) is a second, separate check.
 */
export const entityRoleAllows = (
  scope: StaffScope,
  entityId: string,
  permissions: Permissions
) =>
  scope.kind === "all" ||
  scope.memberships.some(
    (membership) =>
      membership.entityId === entityId &&
      roleAllows(membership.role, permissions)
  );

/** The entities where the role of the user has all the permissions. Null for the admin scope (all entities). */
export const entitiesAllowing = (
  scope: StaffScope,
  permissions: Permissions
): string[] | null =>
  scope.kind === "all"
    ? null
    : scope.memberships
        .filter((membership) => roleAllows(membership.role, permissions))
        .map((membership) => membership.entityId);

/** A WHERE condition that keeps the rows of the entities where the role has the permissions. */
export const entityScopeFilter = (
  column: Column,
  scope: StaffScope,
  permissions: Permissions
) => {
  const entityIds = entitiesAllowing(scope, permissions);
  return entityIds === null ? undefined : inArray(column, entityIds);
};
