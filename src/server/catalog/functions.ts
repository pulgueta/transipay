import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/server/db/client";
import { ENTITY_KINDS, branch, entity } from "@/server/db/schema/entities";
import { infraction, procedureType } from "@/server/db/schema/obligations";
import { authMiddleware } from "@/server/middleware/auth";

/** The active entities, by name. `kind` limits the list, for example to the transit authority. */
export const listEntitiesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ kind: z.enum(ENTITY_KINDS).optional() }).default({}))
  .handler(
    async ({ data }) =>
      await db
        .select({ id: entity.id, name: entity.name, kind: entity.kind })
        .from(entity)
        .where(
          and(
            eq(entity.isActive, true),
            data.kind === undefined ? undefined : eq(entity.kind, data.kind)
          )
        )
        .orderBy(asc(entity.name))
  );

/** The active branches of one entity, by name. */
export const listBranchesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ entityId: z.uuid() }))
  .handler(
    async ({ data }) =>
      await db
        .select({ id: branch.id, name: branch.name, address: branch.address })
        .from(branch)
        .where(
          and(eq(branch.entityId, data.entityId), eq(branch.isActive, true))
        )
        .orderBy(asc(branch.name))
  );

/** The procedure types of one entity, by name, with the fee. */
export const listProcedureTypesFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ entityId: z.uuid() }))
  .handler(
    async ({ data }) =>
      await db
        .select({
          id: procedureType.id,
          code: procedureType.code,
          name: procedureType.name,
          amountInCents: procedureType.amountInCents,
          requiresAppointment: procedureType.requiresAppointment,
        })
        .from(procedureType)
        .where(eq(procedureType.entityId, data.entityId))
        .orderBy(asc(procedureType.name))
  );

/** The active infractions of the catalog, by code. */
export const listInfractionsFn = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(
    async () =>
      await db
        .select({
          id: infraction.id,
          code: infraction.code,
          description: infraction.description,
          amountInCents: infraction.amountInCents,
        })
        .from(infraction)
        .where(eq(infraction.isActive, true))
        .orderBy(asc(infraction.code))
  );
