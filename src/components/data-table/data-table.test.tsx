import {
  columnVisibilityFeature,
  createColumnHelper,
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
        .getByRole("cell", { name: "No records to show." })
        .getAttribute("colspan")
    ).toBe("1");
  });

  it("renders a core-only table without visibility APIs", () => {
    render(<CoreOnlyFixture />);

    expect(screen.getByRole("cell", { name: "Ada" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Public" })).toBeTruthy();
  });
});
