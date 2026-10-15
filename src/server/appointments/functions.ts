import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { httpError, throwNotFound } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";

import {
  bookAppointment,
  cancelAppointment,
  listAppointments,
  readBookingOptions,
} from "./appointments";
import type { BookRefusal } from "./appointments";
import type { CancelRefusal } from "./decisions";

/** The citizen reads these messages, so each one says what to do next. */
const BOOK_MESSAGES: Record<BookRefusal, string> = {
  no_citizen: "Link your document in your account before you book.",
  too_soon: "Select a time at least one hour from now.",
  branch_not_found: "This branch is not available. Select another branch.",
  procedure_type_not_found:
    "This procedure is not available at the entity. Select another procedure.",
  obligation_not_found:
    "This procedure obligation is not pending. Book without an obligation.",
};

const CANCEL_MESSAGES: Record<CancelRefusal, string> = {
  not_scheduled: "This appointment is not scheduled, so you cannot cancel it.",
  in_the_past: "This appointment already started, so you cannot cancel it.",
};

export const bookingSchema = z.object({
  entityId: z.uuid("Select an entity."),
  branchId: z.uuid("Select a branch."),
  procedureTypeId: z.uuid("Select a procedure."),
  obligationId: z.uuid().optional(),
  scheduledAt: z.iso.datetime({
    offset: true,
    message: "Select a date and time.",
  }),
});

/** The appointments of the signed-in citizen, upcoming and past. */
export const listMyAppointmentsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ appointment: ["read"] })])
  .handler(
    async ({ context }) =>
      await listAppointments(db, { userId: context.user.id })
  );

/** The entities, branches, procedure types, and pending procedures that the booking form offers. */
export const getBookingOptionsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ appointment: ["create"] })])
  .handler(
    async ({ context }) =>
      await readBookingOptions(db, { userId: context.user.id })
  );

/** Books an appointment and returns it as it is stored. */
export const createAppointmentFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ appointment: ["create"] })])
  .validator(bookingSchema)
  .handler(async ({ context, data }) => {
    const outcome = await bookAppointment(db, {
      userId: context.user.id,
      actorId: context.actorId,
      entityId: data.entityId,
      branchId: data.branchId,
      procedureTypeId: data.procedureTypeId,
      obligationId: data.obligationId ?? null,
      scheduledAt: new Date(data.scheduledAt),
    });
    if (!outcome.ok) {
      throw httpError(
        outcome.reason === "no_citizen" ? 409 : 422,
        BOOK_MESSAGES[outcome.reason]
      );
    }
    return outcome.appointment;
  });

/** Cancels a scheduled appointment of the signed-in citizen and returns it as it is stored. */
export const cancelAppointmentFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ appointment: ["cancel"] })])
  .validator(z.object({ appointmentId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const outcome = await cancelAppointment(db, {
      userId: context.user.id,
      actorId: context.actorId,
      appointmentId: data.appointmentId,
    });
    if (!outcome.ok) {
      if (outcome.reason === "not_found") {
        return throwNotFound();
      }
      throw httpError(409, CANCEL_MESSAGES[outcome.reason]);
    }
    return outcome.appointment;
  });
