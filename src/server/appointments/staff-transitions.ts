import type { AppointmentStatus } from "@/server/db/schema/scheduling";

/** The statuses that staff can give a scheduled appointment. A citizen cancels through the citizen pages. */
export const STAFF_APPOINTMENT_OUTCOMES = [
  "attended",
  "no_show",
] as const satisfies readonly AppointmentStatus[];

export type StaffAppointmentOutcome =
  (typeof STAFF_APPOINTMENT_OUTCOMES)[number];

/** True when staff can move the appointment from `from` to `to`. Only a scheduled appointment moves. */
export const canStaffTransition = (
  from: AppointmentStatus,
  to: StaffAppointmentOutcome
): boolean => from === "scheduled" && STAFF_APPOINTMENT_OUTCOMES.includes(to);
