import { isFunction } from "@tanstack/react-table";
import type {
  Header,
  ReactTable,
  RowData,
  TableFeatures,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<
  TFeatures extends TableFeatures,
  TData extends RowData,
> {
  table: ReactTable<TFeatures, TData, unknown>;
  emptyMessage?: string;
}

const ARIA_SORT = {
  asc: "ascending",
  desc: "descending",
  false: "none",
} as const;

/**
 * The row actions stay at the right edge while the table scrolls, so they show on a phone.
 * The left border shows that the other columns scroll under them.
 */
const PINNED_ACTIONS_CLASS =
  "bg-background sticky right-0 z-10 shadow-[inset_1px_0_0_var(--color-border)]";

const pinnedClass = (columnId: string) =>
  columnId === "actions" ? PINNED_ACTIONS_CLASS : undefined;

/** The `aria-sort` of a header. A column that cannot sort, or a table without sorting, gets none. */
const ariaSort = <TFeatures extends TableFeatures, TData extends RowData>(
  header: Header<TFeatures, TData>
) => {
  const { column } = header;
  const canSort =
    "getCanSort" in column &&
    isFunction<() => boolean>(column.getCanSort) &&
    column.getCanSort();
  return canSort ? ARIA_SORT[`${column.getIsSorted()}`] : undefined;
};

/**
 * Renders a v9 table instance. It owns markup only, not state.
 * Visibility APIs require `columnVisibilityFeature`. A core-only table shows all columns.
 *
 * Usage: keep `features` and `columns` at module scope and `data` stable. Give each table
 * a unique `key`, so that the Table devtools panel can show it (development only).
 *
 *   const features = tableFeatures({});
 *   const helper = createColumnHelper<typeof features, Payment>();
 *   const columns = helper.columns([helper.accessor("reference", { header: "Reference" })]);
 *
 *   const table = useTable({ key: "citizen-payments", features, columns, data, getRowId: (row) => row.id });
 *   useTanStackTableDevtools(table);
 *   return <DataTable table={table} />;
 *
 * Give the row actions column the id "actions". It stays visible at the right edge on a small screen.
 *
 * Server-side keyset pagination: a server function returns `toPage(rows, limit)`
 * (`src/server/db/pagination.ts`). Pass `page.items` as `data`, and send `page.nextCursor`
 * as the `cursor` of the next request.
 */
export const DataTable = <
  TFeatures extends TableFeatures,
  TData extends RowData,
>({
  table,
  emptyMessage = "No hay registros para mostrar.",
}: DataTableProps<TFeatures, TData>) => {
  const { rows } = table.getRowModel();
  const headerGroups = table.getHeaderGroups();
  const visibleLeafColumns =
    "getVisibleLeafColumns" in table &&
    isFunction<typeof table.getAllLeafColumns>(table.getVisibleLeafColumns)
      ? table.getVisibleLeafColumns()
      : table.getAllLeafColumns();

  return (
    <Table>
      <TableHeader>
        {headerGroups.map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                aria-sort={ariaSort(header)}
                className={pinnedClass(header.column.id)}
                colSpan={header.colSpan}
                key={header.id}
              >
                {header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length > 0 ? (
          rows.map((row) => (
            <TableRow key={row.id}>
              {("getVisibleCells" in row
                ? row.getVisibleCells()
                : row.getAllCells()
              ).map((cell) => (
                <TableCell
                  className={pinnedClass(cell.column.id)}
                  key={cell.id}
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell
              className="text-muted-foreground h-24 text-center"
              colSpan={visibleLeafColumns.length}
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};
