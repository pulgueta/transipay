import "@tanstack/react-start/server-only";
import { and, asc, eq } from "drizzle-orm";

import type { Permissions } from "@/lib/auth/permissions";
import type { Database } from "@/server/db/client";
import { entity } from "@/server/db/schema/entities";
import type { EntityKind, StaffRole } from "@/server/db/schema/entities";

import { entityScopeFilter } from "./scope";
import type { StaffScope } from "./scope";

/**
 * The active entities where the role of the user has all the permissions, by name, with that role.
 * The admin gets all active entities with the role `admin`. Use it for the staff entity pickers.
 */
export const listStaffEntities = async (
  database: Database,
  input: { scope: StaffScope; permissions: Permissions; kind?: EntityKind }
): Promise<
  { id: string; name: string; kind: EntityKind; role: StaffRole }[]
> => {
  const rows = await database
    .select({ id: entity.id, name: entity.name, kind: entity.kind })
    .from(entity)
    .where(
      and(
        eq(entity.isActive, true),
        input.kind === undefined ? undefined : eq(entity.kind, input.kind),
        entityScopeFilter(entity.id, input.scope, input.permissions)
      )
    )
    .orderBy(asc(entity.name));
  const { scope } = input;
  if (scope.kind === "all") {
    return rows.map((row) => ({ ...row, role: "admin" }));
  }
  const roleOf = new Map(
    scope.memberships.map((membership) => [
      membership.entityId,
      membership.role,
    ])
  );
  return rows.flatMap((row) => {
    const role = roleOf.get(row.id);
    return role === undefined ? [] : [{ ...row, role }];
  });
};
