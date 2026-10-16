import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { staffScopeFor } from "@/server/staff/scope";

import { STAFF_APPOINTMENT_OUTCOMES } from "./staff-transitions";
import { listStaffAppointments, updateAppointmentStatus } from "./staff-update";

/** The scheduled appointments of the entities of the staff member (all for the admin), earliest first. */
export const listStaffAppointmentsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ appointment: ["update"] })])
  .validator(
    z.object({
      cursor: z
        .object({ scheduledAt: z.iso.datetime(), id: z.uuid() })
        .optional(),
      limit: z.int().min(1).max(100).default(50),
    })
  )
  .handler(
    async ({ context, data }) =>
      await listStaffAppointments(db, {
        scope: await staffScopeFor(db, context.user),
        cursor: data.cursor,
        limit: data.limit,
      })
  );

const UPDATE_MESSAGES = {
  appointment_not_found: "No encontramos esta cita.",
  not_allowed:
    "Esta cita no está programada, por eso su estado no puede cambiar.",
  not_started:
    "Esta cita no ha empezado. Puede registrar el resultado después de su hora.",
} as const;

/** Closes an appointment as attended or no-show. Returns the appointment as stored after the write. */
export const updateAppointmentStatusFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ appointment: ["update"] })])
  .validator(
    z.object({
      appointmentId: z.uuid(),
      status: z.enum(STAFF_APPOINTMENT_OUTCOMES),
    })
  )
  .handler(async ({ context, data }) => {
    const outcome = await updateAppointmentStatus(db, {
      actorId: context.actorId,
      appointmentId: data.appointmentId,
      status: data.status,
      scope: await staffScopeFor(db, context.user),
    });
    if (!outcome.ok) {
      throw httpError(
        outcome.reason === "appointment_not_found" ? 404 : 409,
        UPDATE_MESSAGES[outcome.reason]
      );
    }
    return outcome.appointment;
  });
