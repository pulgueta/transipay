import { isFunction } from "@tanstack/react-table";
import type { ReactTable, RowData, TableFeatures } from "@tanstack/react-table";

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
              <TableHead colSpan={header.colSpan} key={header.id}>
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
                <TableCell key={cell.id}>
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
