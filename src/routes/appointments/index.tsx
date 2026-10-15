import { IconCalendarEvent, IconId, IconPlus } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { AppointmentsList } from "@/components/appointments/appointments-list";
import { appointmentsQueryOptions } from "@/components/appointments/queries";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSession } from "@/lib/auth/guards";

const PageHeader = ({ canBook }: { canBook: boolean }) => (
  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">Appointments</h1>
      <p className="text-muted-foreground">
        Your appointments at the ITTB, the CDAs, and the CEAs.
      </p>
    </div>
    {canBook ? (
      <Button nativeButton={false} render={<Link to="/appointments/new" />}>
        <IconPlus data-icon="inline-start" strokeWidth={1.75} />
        Book an appointment
      </Button>
    ) : null}
  </div>
);

const NoDocument = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconId strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle>Link your document first</EmptyTitle>
      <EmptyDescription>
        An appointment is booked for your document. Add it to your account to
        book one.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button nativeButton={false} render={<Link to="/account" />}>
        Open my account
      </Button>
    </EmptyContent>
  </Empty>
);

const NoAppointments = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconCalendarEvent strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle>No appointments</EmptyTitle>
      <EmptyDescription>
        You have no upcoming appointments. Book one for a procedure at the
        entity of your choice.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button nativeButton={false} render={<Link to="/appointments/new" />}>
        Book an appointment
      </Button>
    </EmptyContent>
  </Empty>
);

const AppointmentsPage = () => {
  const { data } = useSuspenseQuery(appointmentsQueryOptions);

  if (!data.hasCitizen) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader canBook={false} />
        <NoDocument />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader canBook />
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Upcoming</h2>
        {data.upcoming.length === 0 ? (
          <NoAppointments />
        ) : (
          <AppointmentsList items={data.upcoming} />
        )}
      </section>
      {data.past.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Past</h2>
          <AppointmentsList items={data.past} />
        </section>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/appointments/")({
  beforeLoad: ({ context, location }) => ({
    session: requireSession(context.session, location.href),
  }),
  loader: async ({ context }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureQueryData(appointmentsQueryOptions);
  },
  head: () => ({ meta: [{ title: "Appointments | Transipay" }] }),
  pendingComponent: () => (
    <div className="flex flex-col gap-8">
      <PageHeader canBook={false} />
      <div aria-busy aria-label="Loading" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  ),
  component: AppointmentsPage,
});
