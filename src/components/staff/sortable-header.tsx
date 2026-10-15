import {
  IconArrowDown,
  IconArrowUp,
  IconArrowsSort,
} from "@tabler/icons-react";
import type { Icon } from "@tabler/icons-react";
import type {
  Column_RowSorting,
  RowData,
  SortDirection,
  TableFeatures,
} from "@tanstack/react-table";

import { Button } from "@/components/ui/button";

interface SortableHeaderProps<
  TFeatures extends TableFeatures,
  TData extends RowData,
> {
  column: Pick<
    Column_RowSorting<TFeatures, TData>,
    "getIsSorted" | "getToggleSortingHandler"
  >;
  label: string;
}

const SORT_ICONS: Record<SortDirection, Icon> = {
  asc: IconArrowUp,
  desc: IconArrowDown,
};

/** A column header that sorts the loaded rows. Use it as the `header` of a column with `rowSortingFeature`. */
export const SortableHeader = <
  TFeatures extends TableFeatures,
  TData extends RowData,
>({
  column,
  label,
}: SortableHeaderProps<TFeatures, TData>) => {
  const sorted = column.getIsSorted();
  const SortIcon = sorted === false ? IconArrowsSort : SORT_ICONS[sorted];

  return (
    <Button
      className="-ml-2.5"
      onClick={column.getToggleSortingHandler()}
      size="sm"
      variant="ghost"
    >
      {label}
      <SortIcon
        aria-hidden
        className={sorted === false ? "text-muted-foreground" : undefined}
        data-icon="inline-end"
        strokeWidth={1.75}
      />
    </Button>
  );
};
