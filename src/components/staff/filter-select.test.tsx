import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterSelect } from "./filter-select";

const items = [
  { value: "all", label: "Todos los estados" },
  { value: "paid", label: "Pagada" },
];

describe(FilterSelect, () => {
  afterEach(cleanup);

  it("shows the label of the selected item, not its value", () => {
    render(
      <FilterSelect
        id="status"
        items={items}
        label="Estado"
        onValueChange={vi.fn<(value: string) => void>()}
        value="all"
      />
    );

    const trigger = screen.getByLabelText("Estado");
    expect(trigger.textContent).toContain("Todos los estados");
    expect(trigger.textContent).not.toContain("all");
  });
});
