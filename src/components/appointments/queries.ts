import { queryOptions } from "@tanstack/react-query";

import {
  getBookingOptionsFn,
  listMyAppointmentsFn,
} from "@/server/appointments/functions";

export const APPOINTMENTS_KEY = ["appointments"] as const;

export const appointmentsQueryOptions = queryOptions({
  queryKey: [...APPOINTMENTS_KEY, "list"],
  queryFn: async () => await listMyAppointmentsFn(),
});

export const bookingOptionsQueryOptions = queryOptions({
  queryKey: [...APPOINTMENTS_KEY, "options"],
  queryFn: async () => await getBookingOptionsFn(),
});
