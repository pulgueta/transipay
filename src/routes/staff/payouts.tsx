import { IconPlus, IconRefresh } from "@tabler/icons-react";
import {
  infiniteQueryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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

import { DataTable } from "@/components/data-table/data-table";
import { useAppForm } from "@/components/form/use-app-form";
import { formatDateTime } from "@/components/staff/format";
import { InlineError } from "@/components/staff/inline-error";
import { LoadMore } from "@/components/staff/load-more";
import { PageHeader } from "@/components/staff/page-header";
import { SortableHeader } from "@/components/staff/sortable-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { canUser } from "@/lib/auth/permissions";
import { formatAmount } from "@/lib/format-amount";
import type {
  PayoutReviewReason,
  PayoutStatus,
} from "@/server/db/schema/payments";
import {
  createPayoutFn,
  listPayoutTargetsFn,
  listPayoutsFn,
  reconcilePayoutsFn,
} from "@/server/payouts/functions";

/** The payout statuses, for the filter. The schema file owns `PAYOUT_STATUSES`, but it loads Drizzle. */
const STATUS_VALUES = [
  "draft",
  "queued",
  "submitting",
  "submitted",
  "uncertain",
  "paid",
  "failed",
] as const satisfies readonly PayoutStatus[];

const STATUS_LABELS: Record<PayoutStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  submitting: "Sending",
  submitted: "Sent",
  uncertain: "Uncertain",
  paid: "Paid",
  failed: "Failed",
};

const STATUS_VARIANTS: Record<
  PayoutStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  queued: "secondary",
  submitting: "secondary",
  submitted: "secondary",
  uncertain: "destructive",
  paid: "default",
  failed: "destructive",
};

const REVIEW_REASON_LABELS: Record<PayoutReviewReason, string> = {
  not_found_after_deadline: "Not found at Wompi after the retry deadline",
  origin_account_missing: "No origin account stored",
};

const ALL = "all";

/** The first page has no cursor. A function keeps the `string | undefined` type of the page param. */
const noCursor = (): string | undefined => undefined;

const searchSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
});

const payoutsQueryOptions = (status: PayoutStatus | undefined) =>
  infiniteQueryOptions({
    queryKey: ["staff", "payouts", status ?? ALL],
    queryFn: async ({ pageParam }) =>
      await listPayoutsFn({ data: { status, cursor: pageParam } }),
    initialPageParam: noCursor(),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

type PayoutRow = Awaited<ReturnType<typeof listPayoutsFn>>["items"][number];

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
});
const helper = createColumnHelper<typeof features, PayoutRow>();

const columns = helper.columns([
  helper.accessor("entityName", {
    header: ({ column }) => <SortableHeader column={column} label="Entity" />,
    sortFn: "alphanumeric",
  }),
  helper.accessor("amountInCents", {
    header: ({ column }) => <SortableHeader column={column} label="Amount" />,
    sortFn: "basic",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatAmount(row.original.amountInCents, row.original.currency)}
      </span>
    ),
  }),
  helper.accessor("status", {
    header: ({ column }) => <SortableHeader column={column} label="Status" />,
    sortFn: "alphanumeric",
    cell: ({ getValue }) => (
      <Badge variant={STATUS_VARIANTS[getValue()]}>
        {STATUS_LABELS[getValue()]}
      </Badge>
    ),
  }),
  helper.accessor("reviewReason", {
    header: "Review reason",
    enableSorting: false,
    cell: ({ getValue }) => {
      const reason = getValue();
      return reason === null ? (
        <span className="text-muted-foreground">None</span>
      ) : (
        REVIEW_REASON_LABELS[reason]
      );
    },
  }),
  helper.accessor("createdAt", {
    header: ({ column }) => <SortableHeader column={column} label="Created" />,
    sortFn: "datetime",
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  helper.accessor("providerPayoutId", {
    header: "Provider id",
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs" title={row.original.reference}>
        {row.original.providerPayoutId ?? "Not sent"}
      </span>
    ),
  }),
]);

const payoutSchema = z.object({
  entityId: z.uuid("Select an entity."),
  amount: z
    .string()
    .trim()
    .regex(/^[1-9]\d*$/u, "Enter a whole amount in pesos, larger than zero."),
});

/** The form of the dialog. It mounts when the dialog opens, so each payout gets a new idempotency key. */
const NewPayoutForm = ({
  onCreated,
}: {
  onCreated: (result: { payoutId: string; status: PayoutStatus }) => void;
}) => {
  const createPayout = useServerFn(createPayoutFn);
  // One key per form mount: a retry of this form repeats the same request, so Wompi does not pay twice.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const targets = useQuery({
    queryKey: ["staff", "payout-targets"],
    queryFn: async () => await listPayoutTargetsFn(),
  });
  const items = useMemo(
    () =>
      (targets.data ?? []).map((target) => ({
        value: target.id,
        label: target.name,
      })),
    [targets.data]
  );

  const form = useAppForm({
    defaultValues: { entityId: "", amount: "" },
    validators: { onChange: payoutSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      const input = payoutSchema.parse(value);
      try {
        onCreated(
          await createPayout({
            data: {
              entityId: input.entityId,
              amountInCents: Number(input.amount) * 100,
              idempotencyKey,
            },
          })
        );
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error
            : new Error("We could not send the payout. Try again.")
        );
      }
    },
  });

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
        <DialogTitle>New payout</DialogTitle>
        <DialogDescription>
          Sends money to the default bank account of the entity. A repeated
          submit of this form does not send a second payout.
        </DialogDescription>
      </DialogHeader>
      {targets.isPending ? (
        <Skeleton className="h-8 w-full" />
      ) : (
        <FieldGroup>
          <form.AppField name="entityId">
            {(field) => (
              <field.SelectField
                items={items}
                label="Entity"
                placeholder={
                  items.length === 0
                    ? "No entity has a default bank account"
                    : "Select an entity"
                }
              />
            )}
          </form.AppField>
          <form.AppField name="amount">
            {(field) => (
              <field.TextField
                aria-describedby="payout-amount-hint"
                inputMode="numeric"
                label="Amount in pesos (COP)"
              />
            )}
          </form.AppField>
          <FieldDescription id="payout-amount-hint">
            Whole pesos, without points or cents.
          </FieldDescription>
        </FieldGroup>
      )}
      <InlineError error={targets.error ?? submitError} />
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <form.AppForm>
          <form.SubmitButton>Send payout</form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  );
};

const NewPayoutDialog = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<{
    payoutId: string;
    status: PayoutStatus;
  } | null>(null);

  return (
    <>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogTrigger render={<Button />}>
          <IconPlus data-icon="inline-start" strokeWidth={1.75} />
          New payout
        </DialogTrigger>
        <DialogContent>
          {open ? (
            <NewPayoutForm
              onCreated={(result) => {
                setCreated(result);
                setOpen(false);
                void queryClient.invalidateQueries({
                  queryKey: ["staff", "payouts"],
                });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {created === null ? null : (
        <Alert>
          <AlertTitle>
            Payout {created.payoutId.slice(0, 8)} is{" "}
            {STATUS_LABELS[created.status].toLowerCase()}
          </AlertTitle>
          <AlertDescription>
            This is the status stored after the send. The final status comes
            through the Wompi webhook or the next reconciliation.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
};

const ReconcileButton = () => {
  const queryClient = useQueryClient();
  const reconcile = useServerFn(reconcilePayoutsFn);
  const run = useMutation({
    mutationFn: async () => await reconcile(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["staff", "payouts"] });
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={run.isPending}
        onClick={() => {
          run.mutate();
        }}
        variant="outline"
      >
        {run.isPending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconRefresh data-icon="inline-start" strokeWidth={1.75} />
        )}
        Reconcile now
      </Button>
      {run.isSuccess ? (
        <output className="text-muted-foreground text-sm">
          Uncertain payouts reconciled. Sent {run.data.sent} queued payouts.
        </output>
      ) : null}
      <InlineError error={run.error} />
    </div>
  );
};

const PayoutsPage = () => {
  const { session } = Route.useRouteContext();
  const { status } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = useSuspenseInfiniteQuery(payoutsQueryOptions(status));
  const data = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data]
  );
  const canCreate = canUser(session.user.role, { payout: ["create"] });

  const table = useTable({
    key: "staff-payouts",
    features,
    columns,
    data,
    getRowId: (row) => row.id,
  });
  useTanStackTableDevtools(table);

  return (
    <>
      <PageHeader
        actions={
          canCreate ? (
            <>
              <ReconcileButton />
              <NewPayoutDialog />
            </>
          ) : undefined
        }
        description="Money sent to the transit entities through Wompi. An uncertain payout waits for reconciliation or for staff."
        title="Payouts"
      />
      <div className="flex items-center gap-2">
        <Label htmlFor="payout-status">Status</Label>
        <Select
          onValueChange={(value) => {
            void navigate({
              search: {
                status:
                  value === ALL || value === null
                    ? undefined
                    : searchSchema.shape.status.parse(value),
              },
            });
          }}
          value={status ?? ALL}
        >
          <SelectTrigger className="w-44" id="payout-status" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUS_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <DataTable emptyMessage="No payouts with this status." table={table} />
      <LoadMore
        error={query.error}
        hasNextPage={query.hasNextPage}
        isFetching={query.isFetchingNextPage}
        onLoadMore={() => {
          void query.fetchNextPage();
        }}
      />
    </>
  );
};

export const Route = createFileRoute("/staff/payouts")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ status: search.status }),
  loader: async ({ context, deps }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.infiniteQuery).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureInfiniteQueryData(
      payoutsQueryOptions(deps.status)
    );
  },
  head: () => ({ meta: [{ title: "Payouts | Staff | Transipay" }] }),
  component: PayoutsPage,
});
