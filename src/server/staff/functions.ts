import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canUser } from "@/lib/auth/permissions";
import type { Permissions } from "@/lib/auth/permissions";
import { db } from "@/server/db/client";
import { ENTITY_KINDS } from "@/server/db/schema/entities";
import { authMiddleware } from "@/server/middleware/auth";

import { listStaffEntities } from "./entities";
import { staffScopeFor } from "./scope";

/** The permissions that each staff entity picker needs. They are the permissions of the write after the picker. */
const PICKER_PERMISSIONS: Record<"obligation" | "course", Permissions> = {
  obligation: { obligation: ["create"] },
  course: { course: ["create"] },
};

/**
 * The active entities where the user can do the write of the picker, with the role in each entity.
 * Empty when the platform role does not have the permissions.
 */
export const listStaffEntitiesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      purpose: z.enum(["obligation", "course"]),
      kind: z.enum(ENTITY_KINDS).optional(),
    })
  )
  .handler(async ({ context, data }) => {
    const permissions = PICKER_PERMISSIONS[data.purpose];
    if (!canUser(context.user.role, permissions)) {
      return [];
    }
    return await listStaffEntities(db, {
      scope: await staffScopeFor(db, context.user),
      permissions,
      kind: data.kind,
    });
  });
