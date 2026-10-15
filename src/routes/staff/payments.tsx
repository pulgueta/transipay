import { IconExternalLink } from "@tabler/icons-react";
import {
  infiniteQueryOptions,
  useMutation,
  useQueryClient,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
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

import { DataTable } from "@/components/data-table/data-table";
import { ConfirmDialog } from "@/components/staff/confirm-dialog";
import { formatDateTime } from "@/components/staff/format";
import { LoadMore } from "@/components/staff/load-more";
import { PageHeader } from "@/components/staff/page-header";
import { SortableHeader } from "@/components/staff/sortable-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAmount } from "@/lib/format-amount";
import type { PaymentAttemptReviewReason } from "@/server/db/schema/payments";
import {
  clearPaymentReviewFn,
  listPaymentsUnderReviewFn,
} from "@/server/payments/functions";

const REVIEW_REASON_LABELS: Record<PaymentAttemptReviewReason, string> = {
  second_approval: "Second approval (possible overpayment)",
  target_not_payable: "Approved for an obligation that is not payable",
};

/** The first page has no cursor. A function keeps the `string | undefined` type of the page param. */
const noCursor = (): string | undefined => undefined;

const reviewQueryOptions = infiniteQueryOptions({
  queryKey: ["staff", "payments-under-review"],
  queryFn: async ({ pageParam }) =>
    await listPaymentsUnderReviewFn({ data: { cursor: pageParam } }),
  initialPageParam: noCursor(),
  getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
});

type ReviewRow = Awaited<
  ReturnType<typeof listPaymentsUnderReviewFn>
>["items"][number];

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
  },
});
const helper = createColumnHelper<typeof features, ReviewRow>();

/** The "Mark as examined" action. It asks for confirmation, because the citizen can pay again after it. */
const ExaminedAction = ({ row }: { row: ReviewRow }) => {
  const queryClient = useQueryClient();
  const clearReview = useServerFn(clearPaymentReviewFn);
  const [open, setOpen] = useState(false);
  const clear = useMutation({
    mutationFn: async () =>
      await clearReview({ data: { attemptId: row.attemptId } }),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: reviewQueryOptions.queryKey,
      });
    },
  });

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        size="sm"
        variant="outline"
      >
        Mark as examined
      </Button>
      <ConfirmDialog
        confirmLabel="Mark as examined"
        description={`The review reason of the attempt for ${row.citizenName} (${formatAmount(row.amountInCents, row.currency)}) is removed. The payment and the obligation do not change. If the money must go back, do the refund separately.`}
        error={clear.error}
        isPending={clear.isPending}
        onConfirm={() => {
          clear.mutate();
        }}
        onOpenChange={setOpen}
        open={open}
        title="Mark the payment as examined"
      />
    </>
  );
};

const columns = helper.columns([
  helper.accessor("citizenDocument", {
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
  helper.accessor("obligationNumber", {
    header: ({ column }) => (
      <SortableHeader column={column} label="Obligation" />
    ),
    sortFn: "alphanumeric",
    cell: ({ row }) => (
      <span className="flex items-center gap-1.5">
        <Badge variant="outline">
          {row.original.obligationKind === "fine" ? "Fine" : "Procedure"}
        </Badge>
        {row.original.obligationNumber}
      </span>
    ),
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
  helper.accessor("reviewReason", {
    header: "Reason",
    enableSorting: false,
    cell: ({ getValue }) => {
      const reason = getValue();
      return reason === null ? null : REVIEW_REASON_LABELS[reason];
    },
  }),
  helper.accessor("createdAt", {
    header: ({ column }) => <SortableHeader column={column} label="Date" />,
    sortFn: "datetime",
    cell: ({ getValue }) => formatDateTime(getValue()),
  }),
  helper.display({
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => (
      <span className="flex items-center justify-end gap-1">
        <Button
          nativeButton={false}
          render={
            <Link
              params={{ paymentId: row.original.paymentId }}
              to="/payments/$paymentId"
            />
          }
          size="sm"
          variant="ghost"
        >
          Payment
          <IconExternalLink data-icon="inline-end" strokeWidth={1.75} />
        </Button>
        <ExaminedAction row={row.original} />
      </span>
    ),
  }),
]);

const PaymentsPage = () => {
  const query = useSuspenseInfiniteQuery(reviewQueryOptions);
  const data = useMemo(
    () => query.data.pages.flatMap((page) => page.items),
    [query.data]
  );

  const table = useTable({
    key: "staff-payments-under-review",
    features,
    columns,
    data,
    getRowId: (row) => row.id,
  });
  useTanStackTableDevtools(table);

  return (
    <>
      <PageHeader
        description="Approved payment attempts that the gateway flagged. Examine each one, then mark it as examined."
        title="Payments under review"
      />
      <DataTable emptyMessage="No payments wait for review." table={table} />
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

export const Route = createFileRoute("/staff/payments")({
  loader: async ({ context }) => {
    // AGENTS.md: loaders use ensureQueryData. TanStack Query 5.104 marks it deprecated (see queryClient.infiniteQuery).
    // oxlint-disable-next-line typescript/no-deprecated
    await context.queryClient.ensureInfiniteQueryData(reviewQueryOptions);
  },
  head: () => ({
    meta: [{ title: "Payments under review | Staff | Transipay" }],
  }),
  component: PaymentsPage,
});
