import { IconPlus } from "@tabler/icons-react";
import { useSelector } from "@tanstack/react-form";
import {
  infiniteQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useTanStackTableDevtools } from "@tanstack/react-table-devtools";
import { useMemo, useState } from "react";
import { z } from "zod";

import { AttendanceDialog } from "@/components/courses/attendance-dialog";
import { DataTable } from "@/components/data-table/data-table";
import { useAppForm } from "@/components/form/use-app-form";
import { formatDateTime } from "@/components/staff/format";
import { InlineError } from "@/components/staff/inline-error";
import { LoadMore } from "@/components/staff/load-more";
import { PageHeader } from "@/components/staff/page-header";
import { SortableHeader } from "@/components/staff/sortable-header";
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
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { canUser } from "@/lib/auth/permissions";
import { canGiveCourses } from "@/lib/courses/course-entities";
import { bogotaWallClockToInstant } from "@/lib/dates";
import { useNow } from "@/lib/use-now";
import {
  listStaffAppointmentsFn,
  updateAppointmentStatusFn,
} from "@/server/appointments/staff-functions";
import type { StaffAppointmentOutcome } from "@/server/appointments/staff-transitions";
import { listBranchesFn } from "@/server/catalog/functions";
import {
  createCourseSessionFn,
  listCourseSessionsFn,
} from "@/server/courses/staff-functions";
import { listStaffEntitiesFn } from "@/server/staff/functions";

type AppointmentPage = Awaited<ReturnType<typeof listStaffAppointmentsFn>>;
type AppointmentRow = AppointmentPage["items"][number];
type SessionRow = Awaited<
  ReturnType<typeof listCourseSessionsFn>
>["items"][number];

/** The first page has no cursor. A function keeps the cursor type of the page param. */
const noAppointmentCursor = (): AppointmentPage["nextCursor"] | undefined =>
  undefined;
const noCursor = (): string | undefined => undefined;

const appointmentsQueryOptions = infiniteQueryOptions({
  queryKey: ["staff", "appointments"],
  queryFn: async ({ pageParam }) =>
    await listStaffAppointmentsFn({
      data: { cursor: pageParam ?? undefined },
    }),
  initialPageParam: noAppointmentCursor(),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

const sessionsQueryOptions = infiniteQueryOptions({
  queryKey: ["staff", "course-sessions"],
  queryFn: async ({ pageParam }) =>
    await listCourseSessionsFn({ data: { cursor: pageParam } }),
  initialPageParam: noCursor(),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
});
const appointmentHelper = createColumnHelper<typeof features, AppointmentRow>();
const sessionHelper = createColumnHelper<typeof features, SessionRow>();

const OUTCOME_LABELS: Record<StaffAppointmentOutcome, string> = {
  attended: "Attended",
  no_show: "No show",
};

/** How often the time gates of the page read the time again. */
const TIME_GATE_INTERVAL_MS = 30_000;

/** The two close actions of a scheduled appointment. They are off until the appointment time. */
const AppointmentActions = ({ row }: { row: AppointmentRow }) => {
  // The device time, again each 30 seconds. The server checks again with the database clock.
  const now = useNow(TIME_GATE_INTERVAL_MS);
  const notStarted = row.scheduledAt.getTime() > now;
  const queryClient = useQueryClient();
  const updateStatus = useServerFn(updateAppointmentStatusFn);
  const update = useMutation({
    mutationFn: async (status: StaffAppointmentOutcome) =>
      await updateStatus({ data: { appointmentId: row.id, status } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: appointmentsQueryOptions.queryKey,
      });
    },
  });

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex gap-1">
        {(["attended", "no_show"] as const).map((status) => (
          <Button
            disabled={notStarted || update.isPending}
            key={status}
            onClick={() => {
              update.mutate(status);
            }}
            size="sm"
            variant="outline"
          >
            {OUTCOME_LABELS[status]}
          </Button>
        ))}
      </span>
      {notStarted ? (
        <span className="text-muted-foreground text-xs">
          Available after the appointment time.
        </span>
      ) : null}
      <InlineError error={update.error} />
    </span>
  );
};

const appointmentColumns = appointmentHelper.columns([
  appointmentHelper.accessor("scheduledAt", {
    header: ({ column }) => <SortableHeader column={column} label="When" />,
    sortFn: "datetime",
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  appointmentHelper.accessor("citizenName", {
    header: ({ column }) => <SortableHeader column={column} label="Citizen" />,
    sortFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{row.original.citizenName}</span>
        <span className="text-muted-foreground text-xs">
          {row.original.citizenDocument}
        </span>
      </span>
    ),
  }),
  appointmentHelper.accessor("procedureName", {
    header: ({ column }) => (
      <SortableHeader column={column} label="Procedure" />
    ),
    sortFn: "alphanumeric",
  }),
  appointmentHelper.accessor("branchName", {
    header: ({ column }) => <SortableHeader column={column} label="Branch" />,
    sortFn: "alphanumeric",
  }),
  appointmentHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <AppointmentActions row={row.original} />,
  }),
]);

const AppointmentsTab = () => {
  const query = useSuspenseInfiniteQuery(appointmentsQueryOptions);
  const data = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data]
  );
  const table = useTable({
    key: "staff-appointments",
    features,
    columns: appointmentColumns,
    data,
    getRowId: (row) => row.id,
  });
  useTanStackTableDevtools(table);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Scheduled appointments of your entities, earliest first. Close each one
        after its time.
      </p>
      <DataTable emptyMessage="No scheduled appointments." table={table} />
      <LoadMore
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetching={query.isFetchingNextPage}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </div>
  );
};

const sessionSchema = z.object({
  entityId: z.uuid("Select an entity."),
  branchId: z.uuid("Select a branch."),
  startsAt: z.string().min(1, "Enter the start."),
  endsAt: z.string().min(1, "Enter the end."),
  capacity: z
    .string()
    .regex(/^[1-9]\d{0,3}$/u, "Enter a whole number larger than zero."),
  discountPercent: z
    .string()
    .regex(/^[1-9]\d?$/u, "Enter a whole number from 1 to 99."),
});

/** The form of the dialog. It mounts when the dialog opens, so a new dialog starts empty. */
const NewSessionForm = ({ onCreated }: { onCreated: () => void }) => {
  const createSession = useServerFn(createCourseSessionFn);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const entities = useQuery({
    queryKey: ["staff", "entities", "course"],
    queryFn: async () =>
      await listStaffEntitiesFn({ data: { purpose: "course" } }),
  });
  const entityItems = useMemo(
    () =>
      (entities.data ?? [])
        .filter((row) => canGiveCourses(row.kind))
        .map((row) => ({ value: row.id, label: row.name })),
    [entities.data]
  );

  const form = useAppForm({
    defaultValues: {
      entityId: "",
      branchId: "",
      startsAt: "",
      endsAt: "",
      capacity: "",
      discountPercent: "",
    },
    validators: { onChange: sessionSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const input = sessionSchema.parse(value);
      try {
        await createSession({
          data: {
            entityId: input.entityId,
            branchId: input.branchId,
            // The inputs are Bogota time, also on a device in another time zone.
            startsAt: bogotaWallClockToInstant(input.startsAt).toISOString(),
            endsAt: bogotaWallClockToInstant(input.endsAt).toISOString(),
            capacity: Number(input.capacity),
            discountPercent: Number(input.discountPercent),
          },
        });
        onCreated();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error
            : new Error("We could not create the session. Try again.")
        );
      }
    },
  });
  const entityId = useSelector(form.store, (state) => state.values.entityId);
  const branches = useQuery({
    queryKey: ["catalog", "branches", entityId],
    queryFn: async () => await listBranchesFn({ data: { entityId } }),
    enabled: entityId !== "",
  });
  const branchItems = useMemo(
    () =>
      (branches.data ?? []).map((row) => ({ value: row.id, label: row.name })),
    [branches.data]
  );

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <DialogHeader>
        <DialogTitle>New course session</DialogTitle>
        <DialogDescription>
          Citizens enroll a fine in the session. Attendance gives the discount.
        </DialogDescription>
      </DialogHeader>
      {entities.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <FieldGroup>
          <form.AppField name="entityId">
            {(field) => (
              <field.SelectField
                items={entityItems}
                label="Entity"
                placeholder="Select an entity"
              />
            )}
          </form.AppField>
          <form.AppField name="branchId">
            {(field) => (
              <field.SelectField
                items={branchItems}
                label="Branch"
                placeholder={
                  entityId === "" ? "Select an entity first" : "Select a branch"
                }
              />
            )}
          </form.AppField>
          <form.AppField name="startsAt">
            {(field) => (
              <field.TextField
                label="Starts at (Bogota time)"
                type="datetime-local"
              />
            )}
          </form.AppField>
          <form.AppField name="endsAt">
            {(field) => (
              <field.TextField
                label="Ends at (Bogota time)"
                type="datetime-local"
              />
            )}
          </form.AppField>
          <form.AppField name="capacity">
            {(field) => (
              <field.TextField inputMode="numeric" label="Capacity" />
            )}
          </form.AppField>
          <form.AppField name="discountPercent">
            {(field) => (
              <field.TextField inputMode="numeric" label="Discount percent" />
            )}
          </form.AppField>
        </FieldGroup>
      )}
      <InlineError error={entities.error ?? branches.error ?? submitError} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <form.AppForm>
          <form.SubmitButton>Create session</form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  );
};

const NewSessionDialog = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button />}>
        <IconPlus data-icon="inline-start" strokeWidth={1.75} />
        New session
      </DialogTrigger>
      <DialogContent>
        {open ? (
          <NewSessionForm
            onCreated={() => {
              setOpen(false);
              void queryClient.invalidateQueries({
                queryKey: sessionsQueryOptions.queryKey,
              });
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

const sessionColumns = sessionHelper.columns([
  sessionHelper.accessor("startsAt", {
    header: ({ column }) => <SortableHeader column={column} label="Starts" />,
    sortFn: "datetime",
    cell: ({ row }) => (
      <span className="flex flex-col">
        <span>{formatDateTime(row.original.startsAt)}</span>
        <span className="text-muted-foreground text-xs">
          Ends {formatDateTime(row.original.endsAt)}
        </span>
      </span>
    ),
  }),
  sessionHelper.accessor("entityName", {
    header: ({ column }) => <SortableHeader column={column} label="Entity" />,
    sortFn: "alphanumeric",
  }),
  sessionHelper.accessor("branchName", {
    header: ({ column }) => <SortableHeader column={column} label="Branch" />,
    sortFn: "alphanumeric",
  }),
  sessionHelper.accessor("enrolledCount", {
    header: ({ column }) => <SortableHeader column={column} label="Enrolled" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.enrolledCount} of {row.original.capacity}
      </span>
    ),
  }),
  sessionHelper.accessor("discountPercent", {
    header: ({ column }) => <SortableHeader column={column} label="Discount" />,
    sortFn: "basic",
    cell: ({ getValue }) => <Badge variant="secondary">{getValue()}%</Badge>,
  }),
  sessionHelper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => <AttendanceDialog session={row.original} />,
  }),
]);

const SessionsTab = () => {
  const query = useSuspenseInfiniteQuery(sessionsQueryOptions);
  const data = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data]
  );
  const table = useTable({
    key: "staff-course-sessions",
    features,
    columns: sessionColumns,
    data,
    getRowId: (row) => row.id,
  });
  useTanStackTableDevtools(table);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          Course sessions of your entities, newest first, with the enrollments
          that are not cancelled.
        </p>
        <NewSessionDialog />
      </div>
      <DataTable emptyMessage="No course sessions yet." table={table} />
      <LoadMore
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetching={query.isFetchingNextPage}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </div>
  );
};

const SchedulePage = () => {
  const { session } = Route.useRouteContext();
  const { role } = session.user;
  const canAppointments = canUser(role, { appointment: ["update"] });
  const canCourses = canUser(role, { course: ["create"] });

  return (
    <>
      <PageHeader
        description="Appointments and course sessions of the entities where you are a staff member."
        title="Schedule"
      />
      <Tabs defaultValue={canAppointments ? "appointments" : "courses"}>
        <TabsList>
          {canAppointments ? (
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
          ) : null}
          {canCourses ? (
            <TabsTrigger value="courses">Course sessions</TabsTrigger>
          ) : null}
        </TabsList>
        {canAppointments ? (
          <TabsContent value="appointments">
            <AppointmentsTab />
          </TabsContent>
        ) : null}
        {canCourses ? (
          <TabsContent value="courses">
            <SessionsTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  );
};

export const Route = createFileRoute("/staff/schedule")({
  loader: async ({ context }) => {
    const { role } = context.session.user;
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.infiniteQuery).
    await Promise.all([
      canUser(role, { appointment: ["update"] })
        ? // oxlint-disable-next-line typescript/no-deprecated
          context.queryClient.ensureInfiniteQueryData(appointmentsQueryOptions)
        : undefined,
      canUser(role, { course: ["create"] })
        ? // oxlint-disable-next-line typescript/no-deprecated
          context.queryClient.ensureInfiniteQueryData(sessionsQueryOptions)
        : undefined,
    ]);
  },
  head: () => ({ meta: [{ title: "Schedule | Staff | Transipay" }] }),
  component: SchedulePage,
});
