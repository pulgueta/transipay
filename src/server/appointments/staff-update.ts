import "@tanstack/react-start/server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { branch } from "@/server/db/schema/entities";
import { procedureType } from "@/server/db/schema/obligations";
import { appointment } from "@/server/db/schema/scheduling";
import { runAsActor } from "@/server/db/with-actor";
import type { StaffScope } from "@/server/staff/scope";

import { canStaffTransition } from "./staff-transitions";
import type { StaffAppointmentOutcome } from "./staff-transitions";

/** A keyset cursor on (scheduled_at, id): the list is in schedule order, and ids break ties. */
export interface ScheduleCursor {
  scheduledAt: string;
  id: string;
}

export interface ListStaffAppointmentsInput {
  scope: StaffScope;
  cursor?: ScheduleCursor;
  limit: number;
}

const scopeFilter = (scope: StaffScope) =>
  scope.kind === "all"
    ? undefined
    : inArray(appointment.entityId, scope.entityIds);

/** The scheduled appointments of the scope, earliest first. Past appointments stay until staff close them. */
export const listStaffAppointments = async (
  database: Database,
  input: ListStaffAppointmentsInput
) => {
  const rows = await database
    .select({
      id: appointment.id,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      citizenName: sql<string>`${citizen.firstName} || ' ' || ${citizen.lastName}`,
      citizenDocument: sql<string>`${citizen.documentType} || ' ' || ${citizen.documentNumber}`,
      branchName: branch.name,
      procedureName: procedureType.name,
    })
    .from(appointment)
    .innerJoin(citizen, eq(citizen.id, appointment.citizenId))
    .innerJoin(branch, eq(branch.id, appointment.branchId))
    .innerJoin(procedureType, eq(procedureType.id, appointment.procedureTypeId))
    .where(
      and(
        eq(appointment.status, "scheduled"),
        scopeFilter(input.scope),
        input.cursor === undefined
          ? undefined
          : sql`(${appointment.scheduledAt}, ${appointment.id}) > (${new Date(input.cursor.scheduledAt)}, ${input.cursor.id}::uuid)`
      )
    )
    .orderBy(asc(appointment.scheduledAt), asc(appointment.id))
    .limit(input.limit + 1);
  const items = rows.slice(0, input.limit);
  const last = rows.length > input.limit ? items.at(-1) : undefined;
  return {
    items,
    nextCursor:
      last === undefined
        ? null
        : { scheduledAt: last.scheduledAt.toISOString(), id: last.id },
  };
};

export type UpdateAppointmentOutcome =
  | { ok: true; appointment: typeof appointment.$inferSelect }
  | {
      ok: false;
      reason: "appointment_not_found" | "not_allowed" | "not_started";
    };

/**
 * Closes a scheduled appointment as attended or no-show, with the actor in the audit log.
 * An appointment outside the scope reads as not found, so staff cannot find out that it exists.
 * An appointment that did not start (database clock) stays scheduled, so the citizen can still cancel it.
 */
export const updateAppointmentStatus = async (
  database: Database,
  input: {
    actorId: string;
    appointmentId: string;
    status: StaffAppointmentOutcome;
    scope: StaffScope;
  }
): Promise<UpdateAppointmentOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const [current] = await tx
      .select({
        status: appointment.status,
        started: sql<boolean>`${appointment.scheduledAt} <= now()`,
      })
      .from(appointment)
      .where(
        and(eq(appointment.id, input.appointmentId), scopeFilter(input.scope))
      )
      .for("update");
    if (current === undefined) {
      return { ok: false, reason: "appointment_not_found" };
    }
    if (!canStaffTransition(current.status, input.status)) {
      return { ok: false, reason: "not_allowed" };
    }
    if (!current.started) {
      return { ok: false, reason: "not_started" };
    }
    const [updated] = await tx
      .update(appointment)
      .set({ status: input.status })
      .where(eq(appointment.id, input.appointmentId))
      .returning();
    if (updated === undefined) {
      throw new Error("The appointment update returned no row.");
    }
    return { ok: true, appointment: updated };
  });
