import { IconId, IconSchool } from "@tabler/icons-react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

import { CancelEnrollmentDialog } from "@/components/courses/cancel-enrollment-dialog";
import { EnrollDialog } from "@/components/courses/enroll-dialog";
import { coursesQueryOptions } from "@/components/courses/queries";
import { Badge } from "@/components/ui/badge";
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
import { formatBogotaDateTime } from "@/lib/dates";
import type { EnrollmentStatus } from "@/server/db/schema/scheduling";

const ENROLLMENT_LABELS: Record<EnrollmentStatus, string> = {
  enrolled: "Enrolled",
  attended: "Attended",
  absent: "Absent",
  cancelled: "Cancelled",
};

const ENROLLMENT_VARIANTS: Record<
  EnrollmentStatus,
  "outline" | "secondary" | "destructive"
> = {
  enrolled: "outline",
  attended: "secondary",
  absent: "destructive",
  cancelled: "secondary",
};

const PageHeader = () => (
  <div className="flex flex-col gap-1">
    <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
    <p className="text-muted-foreground">
      Pedagogical courses that give a discount on a fine. Enroll in a session
      with a free seat.
    </p>
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
        The discount applies to a fine on your document. Add it to your account
        to enroll.
      </EmptyDescription>
    </EmptyHeader>
    <EmptyContent>
      <Button nativeButton={false} render={<Link to="/account" />}>
        Open my account
      </Button>
    </EmptyContent>
  </Empty>
);

const NoSessions = () => (
  <Empty className="border">
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <IconSchool strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle>No open sessions</EmptyTitle>
      <EmptyDescription>
        No course session is open now. Come back later, or ask a CEA for its
        next dates.
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
);

const CoursesPage = () => {
  const { data } = useSuspenseQuery(coursesQueryOptions);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader />
      {data.hasCitizen ? null : <NoDocument />}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Open sessions</h2>
        {data.sessions.length === 0 ? (
          <NoSessions />
        ) : (
          <ul className="divide-y">
            {data.sessions.map((session) => (
              <li
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                key={session.id}
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {formatBogotaDateTime(session.startsAt)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {session.entityName} · {session.branchName},{" "}
                    {session.branchAddress}
                  </p>
                  <p className="text-sm">
                    {session.discountPercent}% discount ·{" "}
                    {session.seatsLeft > 0
                      ? `${session.seatsLeft} of ${session.capacity} seats free`
                      : "No seats free"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {session.enrolled ? (
                    <Badge variant="secondary">Enrolled</Badge>
                  ) : null}
                  {data.hasCitizen &&
                  !session.enrolled &&
                  session.seatsLeft > 0 &&
                  data.fines.length > 0 ? (
                    <EnrollDialog
                      courseSessionId={session.id}
                      discountPercent={session.discountPercent}
                      fines={data.fines}
                      startsAt={session.startsAt}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.hasCitizen &&
        data.fines.length === 0 &&
        data.sessions.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            You have no pending fine without a course, so there is nothing to
            discount.
          </p>
        ) : null}
      </section>

      {data.enrollments.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">My enrollments</h2>
          <ul className="divide-y">
            {data.enrollments.map((item) => (
              <li
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
                key={item.id}
              >
                <div className="flex flex-col gap-1">
                  <p className="font-medium">
                    {formatBogotaDateTime(item.startsAt)}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {item.entityName} · {item.branchName}
                  </p>
                  <p className="text-sm">
                    Fine {item.obligationNumber} · {item.discountPercent}%
                    discount
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={ENROLLMENT_VARIANTS[item.status]}>
                    {ENROLLMENT_LABELS[item.status]}
                  </Badge>
                  {item.canCancel ? (
                    <CancelEnrollmentDialog
                      enrollmentId={item.id}
                      startsAt={item.startsAt}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/courses/")({
  beforeLoad: ({ context, location }) => ({
    session: requireSession(context.session, location.href),
  }),
  loader: async ({ context }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.query).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureQueryData(coursesQueryOptions);
  },
  head: () => ({ meta: [{ title: "Courses | Transipay" }] }),
  pendingComponent: () => (
    <div className="flex flex-col gap-8">
      <PageHeader />
      <div aria-busy aria-label="Loading" className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  ),
  component: CoursesPage,
});
