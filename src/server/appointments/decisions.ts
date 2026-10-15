import type { AppointmentStatus } from "@/server/db/schema/scheduling";

/** A citizen books at least one hour ahead. */
export const MIN_LEAD_MS = 60 * 60 * 1000;

export const earliestScheduledAt = (now: Date) =>
  new Date(now.getTime() + MIN_LEAD_MS);

/** True when the time is at least `MIN_LEAD_MS` after now. */
export const canSchedule = (scheduledAt: Date, now: Date) =>
  scheduledAt.getTime() >= now.getTime() + MIN_LEAD_MS;

export type CancelRefusal = "not_scheduled" | "in_the_past";

/** A citizen cancels only a scheduled appointment that did not start. */
export const canCancelAppointment = (
  appointment: { status: AppointmentStatus; scheduledAt: Date },
  now: Date
): { ok: true } | { ok: false; reason: CancelRefusal } => {
  if (appointment.status !== "scheduled") {
    return { ok: false, reason: "not_scheduled" };
  }
  if (appointment.scheduledAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "in_the_past" };
  }
  return { ok: true };
};
