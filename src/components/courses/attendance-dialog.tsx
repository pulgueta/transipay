import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { InlineError } from "@/components/staff/inline-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  completeEnrollmentFn,
  listSessionEnrollmentsFn,
  markEnrollmentAbsentFn,
} from "@/server/courses/staff-functions";
import type { EnrollmentStatus } from "@/server/db/schema/scheduling";

type EnrollmentRow = Awaited<
  ReturnType<typeof listSessionEnrollmentsFn>
>[number];

const STATUS_LABELS: Record<EnrollmentStatus, string> = {
  enrolled: "Enrolled",
  attended: "Attended",
  absent: "Absent",
  cancelled: "Cancelled",
};

const enrollmentsKey = (courseSessionId: string) => [
  "staff",
  "course-sessions",
  courseSessionId,
  "enrollments",
];

/** One enrolled citizen, with the two attendance actions while the result is not recorded. */
const EnrollmentItem = ({
  row,
  courseSessionId,
  ended,
}: {
  row: EnrollmentRow;
  courseSessionId: string;
  ended: boolean;
}) => {
  const queryClient = useQueryClient();
  const complete = useServerFn(completeEnrollmentFn);
  const markAbsent = useServerFn(markEnrollmentAbsentFn);
  const record = useMutation({
    mutationFn: async (outcome: "attended" | "absent") =>
      outcome === "attended"
        ? await complete({ data: { enrollmentId: row.id } })
        : await markAbsent({ data: { enrollmentId: row.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: enrollmentsKey(courseSessionId),
      });
    },
  });

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex flex-col">
          <span>{row.citizenName}</span>
          <span className="text-muted-foreground text-xs">
            {row.citizenDocument} · Fine {row.obligationNumber}
          </span>
        </span>
        {row.status === "enrolled" ? (
          <span className="flex gap-1">
            <Button
              disabled={!ended || record.isPending}
              onClick={() => {
                record.mutate("attended");
              }}
              size="sm"
              variant="outline"
            >
              Attended
            </Button>
            <Button
              disabled={!ended || record.isPending}
              onClick={() => {
                record.mutate("absent");
              }}
              size="sm"
              variant="outline"
            >
              Absent
            </Button>
          </span>
        ) : (
          <Badge variant="secondary">{STATUS_LABELS[row.status]}</Badge>
        )}
      </div>
      <InlineError error={record.error} />
    </li>
  );
};

const EnrollmentList = ({
  courseSessionId,
  ended,
}: {
  courseSessionId: string;
  ended: boolean;
}) => {
  const listEnrollments = useServerFn(listSessionEnrollmentsFn);
  const enrollments = useQuery({
    queryKey: enrollmentsKey(courseSessionId),
    queryFn: async () => await listEnrollments({ data: { courseSessionId } }),
  });

  if (enrollments.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }
  if (enrollments.error) {
    return <InlineError error={enrollments.error} />;
  }
  if (enrollments.data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No citizens are enrolled in this session.
      </p>
    );
  }
  return (
    <ul className="divide-y">
      {enrollments.data.map((row) => (
        <EnrollmentItem
          courseSessionId={courseSessionId}
          key={row.id}
          row={row}
          ended={ended}
        />
      ))}
    </ul>
  );
};

/** Records the attendance of each enrolled citizen. An attendance gives the session discount on the fine. */
export const AttendanceDialog = ({
  session,
}: {
  session: { id: string; endsAt: Date };
}) => {
  const [open, setOpen] = useState(false);
  // The time at mount. The server checks again with the database clock.
  // oxlint-disable-next-line react/hook-use-state -- The time is fixed at mount. Nothing sets it later.
  const [mountedAt] = useState(Date.now);
  const ended = session.endsAt.getTime() <= mountedAt;

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Attendance
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attendance</DialogTitle>
          <DialogDescription>
            {ended
              ? "Record the result for each citizen. When a citizen attended, the fine gets the session discount."
              : "This session did not end. You can record the attendance after its end."}
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <EnrollmentList courseSessionId={session.id} ended={ended} />
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
