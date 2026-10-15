import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, exists, gte, lt } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { branch, entity } from "@/server/db/schema/entities";
import {
  obligation,
  procedure,
  procedureType,
} from "@/server/db/schema/obligations";
import { appointment } from "@/server/db/schema/scheduling";
import { runAsActor } from "@/server/db/with-actor";

import { canCancelAppointment, canSchedule } from "./decisions";
import type { CancelRefusal } from "./decisions";

const citizenIdOf = async (
  database: Database | Transaction,
  userId: string
) => {
  const mine = await database.query.citizen.findFirst({
    where: eq(citizen.userId, userId),
    columns: { id: true },
  });
  return mine?.id ?? null;
};

const appointmentColumns = {
  id: appointment.id,
  scheduledAt: appointment.scheduledAt,
  status: appointment.status,
  obligationId: appointment.obligationId,
  entityName: entity.name,
  branchName: branch.name,
  branchAddress: branch.address,
  procedureTypeName: procedureType.name,
};

const appointmentQuery = (database: Database | Transaction) =>
  database
    .select(appointmentColumns)
    .from(appointment)
    .innerJoin(citizen, eq(citizen.id, appointment.citizenId))
    .innerJoin(entity, eq(entity.id, appointment.entityId))
    .innerJoin(branch, eq(branch.id, appointment.branchId))
    .innerJoin(procedureType, eq(procedureType.id, appointment.procedureTypeId))
    .$dynamic();

type AppointmentRow = Awaited<ReturnType<typeof appointmentQuery>>[number];

const toView = (row: AppointmentRow, now: Date) => ({
  ...row,
  canCancel: canCancelAppointment(row, now).ok,
});

export type AppointmentView = ReturnType<typeof toView>;

/** The appointments of the user: the upcoming ones first by time, the past ones newest first. */
export const listAppointments = async (
  database: Database,
  input: { userId: string }
) => {
  const citizenId = await citizenIdOf(database, input.userId);
  if (citizenId === null) {
    return { hasCitizen: false, upcoming: [], past: [] };
  }
  const now = new Date();
  const mine = eq(appointment.citizenId, citizenId);
  const [upcoming, past] = await Promise.all([
    appointmentQuery(database)
      .where(and(mine, gte(appointment.scheduledAt, now)))
      .orderBy(asc(appointment.scheduledAt)),
    appointmentQuery(database)
      .where(and(mine, lt(appointment.scheduledAt, now)))
      .orderBy(desc(appointment.scheduledAt)),
  ]);
  return {
    hasCitizen: true,
    upcoming: upcoming.map((row) => toView(row, now)),
    past: past.map((row) => toView(row, now)),
  };
};

/** What the booking form offers: active entities with a procedure type, and the pending procedures of the citizen. */
export const readBookingOptions = async (
  database: Database,
  input: { userId: string }
) => {
  const entities = await database.query.entity.findMany({
    where: and(
      eq(entity.isActive, true),
      exists(
        database
          .select({ id: procedureType.id })
          .from(procedureType)
          .where(eq(procedureType.entityId, entity.id))
      )
    ),
    columns: { id: true, name: true, kind: true },
    orderBy: asc(entity.name),
    with: {
      branches: {
        where: eq(branch.isActive, true),
        columns: { id: true, name: true, address: true },
        orderBy: asc(branch.name),
      },
      procedureTypes: {
        columns: { id: true, name: true, amountInCents: true },
        orderBy: asc(procedureType.name),
      },
    },
  });

  const citizenId = await citizenIdOf(database, input.userId);
  const obligations =
    citizenId === null
      ? []
      : await database
          .select({
            id: obligation.id,
            number: obligation.number,
            entityId: obligation.entityId,
            entityName: entity.name,
            procedureTypeId: procedure.procedureTypeId,
          })
          .from(obligation)
          .innerJoin(entity, eq(entity.id, obligation.entityId))
          .innerJoin(procedure, eq(procedure.obligationId, obligation.id))
          .where(
            and(
              eq(obligation.citizenId, citizenId),
              eq(obligation.kind, "procedure"),
              eq(obligation.status, "pending")
            )
          )
          .orderBy(desc(obligation.id));

  return { hasCitizen: citizenId !== null, entities, obligations };
};

export interface BookAppointmentInput {
  userId: string;
  actorId: string;
  entityId: string;
  branchId: string;
  procedureTypeId: string;
  obligationId: string | null;
  scheduledAt: Date;
}

export type BookRefusal =
  | "no_citizen"
  | "too_soon"
  | "branch_not_found"
  | "procedure_type_not_found"
  | "obligation_not_found"
  | "obligation_mismatch";

export type BookOutcome =
  | { ok: true; appointment: AppointmentView }
  | { ok: false; reason: BookRefusal };

/**
 * Books an appointment for the citizen of the user.
 * The branch and the procedure type must belong to the entity, and the obligation to the citizen.
 * The obligation must also be a procedure of the same entity and procedure type as the appointment.
 * The composite foreign keys enforce the same rules, so a race cannot get past these checks.
 */
export const bookAppointment = async (
  database: Database,
  input: BookAppointmentInput
): Promise<BookOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const citizenId = await citizenIdOf(tx, input.userId);
    if (citizenId === null) {
      return { ok: false, reason: "no_citizen" };
    }
    if (!canSchedule(input.scheduledAt, new Date())) {
      return { ok: false, reason: "too_soon" };
    }

    const branches = await tx
      .select({ id: branch.id })
      .from(branch)
      .innerJoin(entity, eq(entity.id, branch.entityId))
      .where(
        and(
          eq(branch.id, input.branchId),
          eq(branch.entityId, input.entityId),
          eq(branch.isActive, true),
          eq(entity.isActive, true)
        )
      );
    if (branches.length === 0) {
      return { ok: false, reason: "branch_not_found" };
    }

    const types = await tx
      .select({ id: procedureType.id })
      .from(procedureType)
      .where(
        and(
          eq(procedureType.id, input.procedureTypeId),
          eq(procedureType.entityId, input.entityId)
        )
      );
    if (types.length === 0) {
      return { ok: false, reason: "procedure_type_not_found" };
    }

    if (input.obligationId !== null) {
      const obligations = await tx
        .select({
          entityId: procedure.entityId,
          procedureTypeId: procedure.procedureTypeId,
        })
        .from(obligation)
        .innerJoin(procedure, eq(procedure.obligationId, obligation.id))
        .where(
          and(
            eq(obligation.id, input.obligationId),
            eq(obligation.citizenId, citizenId),
            eq(obligation.kind, "procedure"),
            eq(obligation.status, "pending")
          )
        );
      const linked = obligations.at(0);
      if (linked === undefined) {
        return { ok: false, reason: "obligation_not_found" };
      }
      if (
        linked.entityId !== input.entityId ||
        linked.procedureTypeId !== input.procedureTypeId
      ) {
        return { ok: false, reason: "obligation_mismatch" };
      }
    }

    const [inserted] = await tx
      .insert(appointment)
      .values({
        citizenId,
        entityId: input.entityId,
        branchId: input.branchId,
        procedureTypeId: input.procedureTypeId,
        obligationId: input.obligationId,
        scheduledAt: input.scheduledAt,
      })
      .returning({ id: appointment.id });
    if (inserted === undefined) {
      throw new Error("The appointment insert returned no row.");
    }
    const rows = await appointmentQuery(tx).where(
      eq(appointment.id, inserted.id)
    );
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error("The appointment was not found after the insert.");
    }
    return { ok: true, appointment: toView(row, new Date()) };
  });

export type CancelOutcome =
  | { ok: true; appointment: AppointmentView }
  | { ok: false; reason: "not_found" | CancelRefusal };

/** Cancels a scheduled appointment of the citizen of the user. Another user's appointment is "not found". */
export const cancelAppointment = async (
  database: Database,
  input: { userId: string; actorId: string; appointmentId: string }
): Promise<CancelOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const rows = await tx
      .select({
        id: appointment.id,
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
      })
      .from(appointment)
      .innerJoin(citizen, eq(citizen.id, appointment.citizenId))
      .where(
        and(
          eq(appointment.id, input.appointmentId),
          eq(citizen.userId, input.userId)
        )
      )
      .for("update", { of: appointment });
    const current = rows.at(0);
    if (current === undefined) {
      return { ok: false, reason: "not_found" };
    }
    const now = new Date();
    const decision = canCancelAppointment(current, now);
    if (!decision.ok) {
      return decision;
    }

    await tx
      .update(appointment)
      .set({ status: "cancelled" })
      .where(eq(appointment.id, current.id));
    const after = await appointmentQuery(tx).where(
      eq(appointment.id, current.id)
    );
    const row = after.at(0);
    if (row === undefined) {
      throw new Error("The appointment was not found after the update.");
    }
    return { ok: true, appointment: toView(row, now) };
  });
