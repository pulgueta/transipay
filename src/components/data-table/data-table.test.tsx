import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DataTable } from "./data-table";

interface RecordRow {
  name: string;
  secret: string;
}

const features = tableFeatures({ columnVisibilityFeature });
const helper = createColumnHelper<typeof features, RecordRow>();
const columns = helper.columns([
  helper.accessor("name", { header: "Name" }),
  helper.accessor("secret", { header: "Secret" }),
]);
const coreFeatures = tableFeatures({});
const coreHelper = createColumnHelper<typeof coreFeatures, RecordRow>();
const coreColumns = coreHelper.columns([
  coreHelper.accessor("name", { header: "Name" }),
  coreHelper.accessor("secret", { header: "Secret" }),
]);

const TableFixture = ({ data }: { data: RecordRow[] }) => {
  const table = useTable({
    key: "visibility-test",
    features,
    columns,
    data,
    initialState: { columnVisibility: { secret: false } },
  });

  return <DataTable table={table} />;
};

const CoreOnlyFixture = () => {
  const table = useTable({
    key: "core-only-test",
    features: coreFeatures,
    columns: coreColumns,
    data: [{ name: "Ada", secret: "Public" }],
  });

  return <DataTable table={table} />;
};

describe("DataTable visibility", () => {
  afterEach(cleanup);

  it("does not render hidden headers or cells", () => {
    render(<TableFixture data={[{ name: "Ada", secret: "Classified" }]} />);

    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Ada" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Secret" })).toBeNull();
    expect(screen.queryByRole("cell", { name: "Classified" })).toBeNull();
  });

  it("spans only visible leaf columns when empty", () => {
    render(<TableFixture data={[]} />);

    expect(
      screen
        .getByRole("cell", { name: "No hay registros para mostrar." })
        .getAttribute("colspan")
    ).toBe("1");
  });

  it("renders a core-only table without visibility APIs", () => {
    render(<CoreOnlyFixture />);

    expect(screen.getByRole("cell", { name: "Ada" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Public" })).toBeTruthy();
  });
});

const sortFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric },
});
const sortHelper = createColumnHelper<typeof sortFeatures, RecordRow>();
const sortColumns = sortHelper.columns([
  sortHelper.accessor("name", { header: "Name", sortFn: "alphanumeric" }),
  sortHelper.accessor("secret", { header: "Secret", enableSorting: false }),
]);

const SortFixture = ({ desc }: { desc?: boolean }) => {
  const table = useTable({
    key: "sort-test",
    features: sortFeatures,
    columns: sortColumns,
    data: [{ name: "Ada", secret: "Public" }],
    initialState: { sorting: desc === undefined ? [] : [{ id: "name", desc }] },
  });

  return <DataTable table={table} />;
};

describe("DataTable sorting", () => {
  afterEach(cleanup);

  it.each([
    [undefined, "none"],
    [false, "ascending"],
    [true, "descending"],
  ])(
    "sets aria-sort on a sortable header (desc %s gives %s)",
    (desc, expected) => {
      render(<SortFixture desc={desc} />);

      expect(
        screen
          .getByRole("columnheader", { name: "Name" })
          .getAttribute("aria-sort")
      ).toBe(expected);
    }
  );

  it("does not set aria-sort on a header that cannot sort", () => {
    render(<SortFixture />);

    expect(
      screen
        .getByRole("columnheader", { name: "Secret" })
        .hasAttribute("aria-sort")
    ).toBeFalsy();
  });
});
