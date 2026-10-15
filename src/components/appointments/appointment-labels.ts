import type { AppointmentStatus } from "@/server/db/schema/scheduling";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  attended: "Attended",
  cancelled: "Cancelled",
  no_show: "Not attended",
};

export const APPOINTMENT_STATUS_VARIANTS: Record<
  AppointmentStatus,
  "outline" | "secondary" | "destructive"
> = {
  scheduled: "outline",
  attended: "secondary",
  cancelled: "secondary",
  no_show: "destructive",
};
