import { Link } from "@tanstack/react-router";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useTanStackTableDevtools } from "@tanstack/react-table-devtools";

import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { formatBogotaDate } from "@/lib/dates";
import { formatAmount } from "@/lib/format-amount";
import type { ObligationView } from "@/server/obligations/read";

import { KIND_LABELS } from "./obligation-labels";
import { ObligationStateBadge } from "./obligation-state-badge";

const CURRENCY = "COP";

/** "1 of 3 installments paid", or null without an active agreement. */
export const installmentsSummary = (agreement: ObligationView["agreement"]) =>
  agreement === null
    ? null
    : `${agreement.paidCount} of ${agreement.installmentCount} installments paid`;

const ObligationLink = ({ item }: { item: ObligationView }) => (
  <Link
    className="font-medium underline-offset-4 hover:underline"
    params={{ obligationId: item.id }}
    to="/obligations/$obligationId"
  >
    {item.description}
  </Link>
);

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, ObligationView>();
const columns = helper.columns([
  helper.accessor("kind", {
    header: "Kind",
    cell: ({ getValue }) => (
      <Badge variant="outline">{KIND_LABELS[getValue()]}</Badge>
    ),
  }),
  helper.accessor("description", {
    header: "Description",
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <ObligationLink item={row.original} />
        <span className="text-muted-foreground text-xs">
          {row.original.entityName} · {row.original.number}
        </span>
      </div>
    ),
  }),
  helper.accessor("dueOn", {
    header: "Due",
    cell: ({ getValue }) => {
      const dueOn = getValue();
      return dueOn === null ? (
        <span className="text-muted-foreground">No date</span>
      ) : (
        formatBogotaDate(dueOn)
      );
    },
  }),
  helper.accessor("amountDueInCents", {
    header: () => <span className="block text-right">Amount due</span>,
    cell: ({ getValue }) => (
      <span className="block text-right tabular-nums">
        {formatAmount(getValue(), CURRENCY)}
      </span>
    ),
  }),
  helper.accessor("state", {
    header: "Status",
    cell: ({ row }) => (
      <div className="flex flex-col items-start gap-1">
        <ObligationStateBadge state={row.original.state} />
        {row.original.agreement === null ? null : (
          <span className="text-muted-foreground text-xs">
            {installmentsSummary(row.original.agreement)}
          </span>
        )}
      </div>
    ),
  }),
]);

const ObligationsTable = ({ items }: { items: ObligationView[] }) => {
  const table = useTable({
    key: "citizen-obligations",
    features,
    columns,
    data: items,
    getRowId: (row) => row.id,
  });
  useTanStackTableDevtools(table);

  return <DataTable emptyMessage="No obligations to show." table={table} />;
};

/** One obligation as a block, for a small screen. */
const ObligationCard = ({ item }: { item: ObligationView }) => (
  <li className="flex flex-col gap-2 py-4">
    <div className="flex items-center justify-between gap-2">
      <Badge variant="outline">{KIND_LABELS[item.kind]}</Badge>
      <ObligationStateBadge state={item.state} />
    </div>
    <ObligationLink item={item} />
    <p className="text-muted-foreground text-xs">
      {item.entityName} · {item.number}
    </p>
    <dl className="grid grid-cols-2 gap-x-4 text-sm">
      <dt className="text-muted-foreground">Amount due</dt>
      <dd className="text-right tabular-nums">
        {formatAmount(item.amountDueInCents, CURRENCY)}
      </dd>
      <dt className="text-muted-foreground">Due</dt>
      <dd className="text-right">
        {item.dueOn === null ? "No date" : formatBogotaDate(item.dueOn)}
      </dd>
      {item.agreement === null ? null : (
        <>
          <dt className="text-muted-foreground">Installments</dt>
          <dd className="text-right">{installmentsSummary(item.agreement)}</dd>
        </>
      )}
    </dl>
  </li>
);

/** The obligations of the citizen: a table on desktop, stacked rows on a small screen. */
export const ObligationsList = ({ items }: { items: ObligationView[] }) => (
  <>
    <div className="hidden md:block">
      <ObligationsTable items={items} />
    </div>
    <ul className="divide-y md:hidden">
      {items.map((item) => (
        <ObligationCard item={item} key={item.id} />
      ))}
    </ul>
  </>
);
