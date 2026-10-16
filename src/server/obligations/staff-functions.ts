import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { documentSchema } from "@/lib/citizens/document";
import { db } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { staffScopeFor } from "@/server/staff/scope";

import { createFine, createProcedure } from "./staff-create";
import type {
  CreateObligationOutcome,
  CreateObligationRefusal,
} from "./staff-create";

/** Staff read these messages. Each one says what to check. */
const REFUSAL_MESSAGES: Record<CreateObligationRefusal, string> = {
  citizen_not_found: "No encontramos a este ciudadano. Búsquelo de nuevo.",
  entity_not_found: "No encontramos esta entidad.",
  entity_not_in_scope:
    "Su rol en esta entidad no le permite hacer esta operación.",
  entity_inactive: "Esta entidad no está activa.",
  entity_not_transit_authority:
    "Solo el organismo de tránsito puede registrar un comparendo.",
  infraction_not_found: "Esta infracción no está en el catálogo activo.",
  procedure_type_not_found: "Este tipo de trámite no pertenece a la entidad.",
  vehicle_not_found:
    "Ningún vehículo tiene esta placa. Registre primero el vehículo o deje la placa vacía.",
  number_in_use: "Esta entidad ya tiene una obligación con este número.",
};

const REFUSAL_STATUSES: Record<CreateObligationRefusal, number> = {
  citizen_not_found: 404,
  entity_not_found: 404,
  entity_not_in_scope: 403,
  entity_inactive: 409,
  entity_not_transit_authority: 409,
  infraction_not_found: 404,
  procedure_type_not_found: 404,
  vehicle_not_found: 404,
  number_in_use: 409,
};

const unwrap = (outcome: CreateObligationOutcome) => {
  if (!outcome.ok) {
    throw httpError(
      REFUSAL_STATUSES[outcome.reason],
      REFUSAL_MESSAGES[outcome.reason]
    );
  }
  return outcome.obligation;
};

const plateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{5,7}$/u, "Escriba de 5 a 7 letras o números.")
  .optional();

const commonSchema = z.object({
  citizenId: z.uuid(),
  entityId: z.uuid(),
  number: z.string().trim().min(3).max(40),
  // A calendar day (YYYY-MM-DD).
  dueOn: z.iso.date().optional(),
  plate: plateSchema,
});

/** Finds the citizen with this document, for the staff forms. Null when no citizen has it. */
export const findCitizenFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ obligation: ["create"] })])
  .validator(documentSchema)
  .handler(async ({ data }) => {
    const rows = await db
      .select({
        id: citizen.id,
        firstName: citizen.firstName,
        lastName: citizen.lastName,
        documentType: citizen.documentType,
        documentNumber: citizen.documentNumber,
      })
      .from(citizen)
      .where(
        and(
          eq(citizen.documentType, data.documentType),
          eq(citizen.documentNumber, data.documentNumber)
        )
      );
    return rows.at(0) ?? null;
  });

/** Registers a fine and returns the obligation as stored (see `createFine`). */
export const createFineFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ obligation: ["create"] })])
  .validator(
    commonSchema.extend({
      infractionId: z.uuid(),
      location: z.string().trim().min(3).max(200),
      occurredAt: z.coerce.date(),
      agentCode: z.string().trim().max(40).optional(),
    })
  )
  .handler(async ({ context, data }) =>
    unwrap(
      await createFine(db, {
        actorId: context.actorId,
        citizenId: data.citizenId,
        entityId: data.entityId,
        infractionId: data.infractionId,
        number: data.number,
        location: data.location,
        occurredAt: data.occurredAt,
        agentCode: data.agentCode ?? null,
        dueOn: data.dueOn ?? null,
        plate: data.plate ?? null,
        scope: await staffScopeFor(db, context.user),
      })
    )
  );

/** Registers a procedure and returns the obligation as stored (see `createProcedure`). */
export const createProcedureFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ obligation: ["create"] })])
  .validator(commonSchema.extend({ procedureTypeId: z.uuid() }))
  .handler(async ({ context, data }) =>
    unwrap(
      await createProcedure(db, {
        actorId: context.actorId,
        citizenId: data.citizenId,
        entityId: data.entityId,
        procedureTypeId: data.procedureTypeId,
        number: data.number,
        dueOn: data.dueOn ?? null,
        plate: data.plate ?? null,
        scope: await staffScopeFor(db, context.user),
      })
    )
  );
