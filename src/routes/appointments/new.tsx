import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { BookingForm } from "@/components/appointments/booking-form";
import type { BookingValues } from "@/components/appointments/booking-form";
import {
  APPOINTMENTS_KEY,
  bookingOptionsQueryOptions,
} from "@/components/appointments/queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSession } from "@/lib/auth/guards";
import { createAppointmentFn } from "@/server/appointments/functions";

/** `obligationId` preselects a pending procedure. A value that is not a UUID is dropped. */
const searchSchema = z.object({
  obligationId: z
    .string()
    .optional()
    .transform((value) =>
      z.uuid().safeParse(value).success ? value : undefined
    ),
});

const PageHeader = () => (
  <div className="flex flex-col gap-1">
    <h1 className="text-2xl font-semibold tracking-tight">Agendar cita</h1>
    <p className="text-muted-foreground">
      Seleccione la entidad, la sede, el trámite y la hora. La confirmación
      aparece en este sitio.
    </p>
  </div>
);

const NewAppointmentPage = () => {
  const { obligationId } = Route.useSearch();
  const { data: options } = useSuspenseQuery(bookingOptionsQueryOptions);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const createAppointment = useServerFn(createAppointmentFn);

  const book = async (values: BookingValues) => {
    try {
      await createAppointment({ data: values });
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "No pudimos agendar la cita. Intente de nuevo.";
    }
    await queryClient.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
    await navigate({ to: "/appointments" });
    return null;
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader />
      {options.hasCitizen ? (
        <BookingForm
          obligationId={obligationId}
          onBook={book}
          options={options}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground">
            Las citas se agendan con su documento. Agréguelo a su cuenta para
            agendar una.
          </p>
          <Button
            className="self-start"
            nativeButton={false}
            render={<Link to="/account" />}
          >
            Ir a mi cuenta
          </Button>
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/appointments/new")({
  validateSearch: searchSchema,
  beforeLoad: ({ context, location }) => ({
    session: requireSession(context.session, location.href),
  }),
  loader: async ({ context }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureQueryData(bookingOptionsQueryOptions);
  },
  head: () => ({ meta: [{ title: "Agendar cita | Transipay" }] }),
  pendingComponent: () => (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <PageHeader />
      <div aria-busy aria-label="Cargando" className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-8 w-40" />
      </div>
    </div>
  ),
  component: NewAppointmentPage,
});
