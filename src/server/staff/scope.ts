import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import { roleNames } from "@/lib/auth/roles";
import type { Database } from "@/server/db/client";
import { staffMember } from "@/server/db/schema/entities";

/** The entities that a staff member can work with. The admin sees all of them. */
export type StaffScope =
  | { kind: "all" }
  | { kind: "entities"; entityIds: string[] };

/** Decides the scope from the platform role and the entity memberships (`staff_member`). */
export const resolveStaffScope = (
  role: string | null | undefined,
  entityIds: string[]
): StaffScope =>
  roleNames(role).includes("admin")
    ? { kind: "all" }
    : { kind: "entities", entityIds };

/** Reads the memberships of the user and resolves the scope. */
export const staffScopeFor = async (
  database: Database,
  user: { id: string; role?: string | null }
): Promise<StaffScope> => {
  if (roleNames(user.role).includes("admin")) {
    return { kind: "all" };
  }
  const rows = await database
    .select({ entityId: staffMember.entityId })
    .from(staffMember)
    .where(eq(staffMember.userId, user.id));
  return resolveStaffScope(
    user.role,
    rows.map((row) => row.entityId)
  );
};
