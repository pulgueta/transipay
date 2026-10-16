import type { AppointmentStatus } from "@/server/db/schema/scheduling";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Programada",
  attended: "Asistida",
  cancelled: "Cancelada",
  no_show: "No asistió",
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
