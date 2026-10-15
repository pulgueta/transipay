import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { documentSchema } from "@/lib/citizens/document";
import { db } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";

import { createFine, createProcedure } from "./staff-create";
import type {
  CreateObligationOutcome,
  CreateObligationRefusal,
} from "./staff-create";

/** Staff read these messages. Each one says what to check. */
const REFUSAL_MESSAGES: Record<CreateObligationRefusal, string> = {
  citizen_not_found: "We cannot find this citizen. Find the citizen again.",
  entity_not_found: "We cannot find this entity.",
  entity_inactive: "This entity is not active.",
  entity_not_transit_authority: "Only the transit authority can issue a fine.",
  infraction_not_found: "This infraction is not in the active catalog.",
  procedure_type_not_found:
    "This procedure type does not belong to the entity.",
  vehicle_not_found:
    "No vehicle has this plate. Register the vehicle first, or leave the plate empty.",
  number_in_use: "This entity already has an obligation with this number.",
};

const REFUSAL_STATUSES: Record<CreateObligationRefusal, number> = {
  citizen_not_found: 404,
  entity_not_found: 404,
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
  .regex(/^[A-Z0-9]{5,7}$/u, "Enter 5 to 7 letters or digits.")
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
      })
    )
  );
