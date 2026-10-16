import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";
import { DatabaseError } from "pg";

import type { Database, Transaction } from "@/server/db/client";
import { citizen, vehicle } from "@/server/db/schema/citizens";
import { entity } from "@/server/db/schema/entities";
import {
  fine,
  infraction,
  obligation,
  procedure,
  procedureType,
} from "@/server/db/schema/obligations";
import { runAsActor } from "@/server/db/with-actor";
import { entityRoleAllows } from "@/server/staff/scope";
import type { StaffScope } from "@/server/staff/scope";

export type StoredObligation = Pick<
  typeof obligation.$inferSelect,
  "id" | "number" | "kind" | "status" | "amountInCents" | "dueOn" | "issuedAt"
>;

export type CreateObligationRefusal =
  | "citizen_not_found"
  | "entity_not_found"
  | "entity_not_in_scope"
  | "entity_inactive"
  | "entity_not_transit_authority"
  | "infraction_not_found"
  | "procedure_type_not_found"
  | "vehicle_not_found"
  | "number_in_use";

export type CreateObligationOutcome =
  | { ok: true; obligation: StoredObligation }
  | { ok: false; reason: CreateObligationRefusal };

interface CommonInput {
  /** The audit actor. */
  actorId: string;
  citizenId: string;
  /** The creditor entity. */
  entityId: string;
  /** The official number of the fine or the procedure. Unique for the entity. */
  number: string;
  dueOn: string | null;
  /** The plate of the vehicle, or null when the obligation has no vehicle. */
  plate: string | null;
  /** The entities of the staff member. Their role in the creditor entity must allow `obligation: create`. */
  scope: StaffScope;
}

export interface CreateFineInput extends CommonInput {
  infractionId: string;
  location: string;
  occurredAt: Date;
  agentCode: string | null;
}

export interface CreateProcedureInput extends CommonInput {
  procedureTypeId: string;
}

const STORED_COLUMNS = {
  id: obligation.id,
  number: obligation.number,
  kind: obligation.kind,
  status: obligation.status,
  amountInCents: obligation.amountInCents,
  dueOn: obligation.dueOn,
  issuedAt: obligation.issuedAt,
};

interface Refused {
  ok: false;
  reason: CreateObligationRefusal;
}

/** The checks that a fine and a procedure share. Returns the vehicle id, or a refusal. */
const checkCommon = async (
  tx: Transaction,
  input: CommonInput,
  requiredKind: "transit_authority" | null
): Promise<{ vehicleId: string | null } | Refused> => {
  if (
    !entityRoleAllows(input.scope, input.entityId, { obligation: ["create"] })
  ) {
    return { ok: false, reason: "entity_not_in_scope" };
  }
  const [target] = await tx
    .select({ kind: entity.kind, isActive: entity.isActive })
    .from(entity)
    .where(eq(entity.id, input.entityId));
  if (target === undefined) {
    return { ok: false, reason: "entity_not_found" };
  }
  if (!target.isActive) {
    return { ok: false, reason: "entity_inactive" };
  }
  if (requiredKind !== null && target.kind !== requiredKind) {
    return { ok: false, reason: "entity_not_transit_authority" };
  }

  const [person] = await tx
    .select({ id: citizen.id })
    .from(citizen)
    .where(eq(citizen.id, input.citizenId));
  if (person === undefined) {
    return { ok: false, reason: "citizen_not_found" };
  }

  const [used] = await tx
    .select({ id: obligation.id })
    .from(obligation)
    .where(
      and(
        eq(obligation.entityId, input.entityId),
        eq(obligation.number, input.number)
      )
    );
  if (used !== undefined) {
    return { ok: false, reason: "number_in_use" };
  }

  if (input.plate === null) {
    return { vehicleId: null };
  }
  const [car] = await tx
    .select({ id: vehicle.id })
    .from(vehicle)
    .where(eq(vehicle.plate, input.plate.trim().toUpperCase()));
  return car === undefined
    ? { ok: false, reason: "vehicle_not_found" }
    : { vehicleId: car.id };
};

const insertObligation = async (
  tx: Transaction,
  input: CommonInput,
  kind: "fine" | "procedure",
  amountInCents: number
) => {
  const [stored] = await tx
    .insert(obligation)
    .values({
      citizenId: input.citizenId,
      entityId: input.entityId,
      kind,
      number: input.number,
      amountInCents,
      dueOn: input.dueOn,
    })
    .returning(STORED_COLUMNS);
  if (stored === undefined) {
    throw new Error("The obligation insert returned no row.");
  }
  return stored;
};

/** True when the error (or its cause) is the unique violation of the obligation number for the entity. */
const isNumberInUseError = (error: Error) => {
  const cause = error.cause instanceof DatabaseError ? error.cause : error;
  return (
    cause instanceof DatabaseError &&
    cause.code === "23505" &&
    cause.constraint === "obligation_entity_id_number_key"
  );
};

/**
 * Two concurrent requests can both pass the check for a used number. Then the unique constraint
 * refuses the second insert, and this function returns `number_in_use` for it.
 */
const refuseUsedNumber = async (
  create: () => Promise<CreateObligationOutcome>
): Promise<CreateObligationOutcome> => {
  try {
    return await create();
  } catch (error) {
    if (error instanceof Error && isNumberInUseError(error)) {
      return { ok: false, reason: "number_in_use" };
    }
    throw error;
  }
};

/**
 * Registers a fine: one obligation row and one fine row, in one transaction with the actor.
 * Only the transit authority issues fines. The amount is the catalog amount at issue time.
 */
export const createFine = async (
  database: Database,
  input: CreateFineInput
): Promise<CreateObligationOutcome> =>
  await refuseUsedNumber(
    async () =>
      await runAsActor(database, input.actorId, async (tx) => {
        const common = await checkCommon(tx, input, "transit_authority");
        if ("ok" in common) {
          return common;
        }
        const [catalog] = await tx
          .select({
            amountInCents: infraction.amountInCents,
            isActive: infraction.isActive,
          })
          .from(infraction)
          .where(eq(infraction.id, input.infractionId));
        if (!catalog?.isActive) {
          return { ok: false, reason: "infraction_not_found" };
        }

        const stored = await insertObligation(
          tx,
          input,
          "fine",
          catalog.amountInCents
        );
        await tx.insert(fine).values({
          obligationId: stored.id,
          infractionId: input.infractionId,
          vehicleId: common.vehicleId,
          location: input.location,
          occurredAt: input.occurredAt,
          agentCode: input.agentCode,
        });
        return { ok: true, obligation: stored };
      })
  );

/**
 * Registers a procedure: one obligation row and one procedure row, in one transaction with the actor.
 * The procedure type must belong to the creditor entity (the database also checks it).
 */
export const createProcedure = async (
  database: Database,
  input: CreateProcedureInput
): Promise<CreateObligationOutcome> =>
  await refuseUsedNumber(
    async () =>
      await runAsActor(database, input.actorId, async (tx) => {
        const common = await checkCommon(tx, input, null);
        if ("ok" in common) {
          return common;
        }
        const [type] = await tx
          .select({ amountInCents: procedureType.amountInCents })
          .from(procedureType)
          .where(
            and(
              eq(procedureType.id, input.procedureTypeId),
              eq(procedureType.entityId, input.entityId)
            )
          );
        if (type === undefined) {
          return { ok: false, reason: "procedure_type_not_found" };
        }

        const stored = await insertObligation(
          tx,
          input,
          "procedure",
          type.amountInCents
        );
        await tx.insert(procedure).values({
          obligationId: stored.id,
          entityId: input.entityId,
          procedureTypeId: input.procedureTypeId,
          vehicleId: common.vehicleId,
        });
        return { ok: true, obligation: stored };
      })
  );
