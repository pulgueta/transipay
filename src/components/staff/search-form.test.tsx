import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchForm } from "./search-form";

const renderForm = (value: string | undefined) => (
  <SearchForm
    label="Buscar por nombre o correo"
    onSearch={vi.fn<(value: string | undefined) => void>()}
    placeholder="Nombre o correo"
    value={value}
  />
);

describe(SearchForm, () => {
  afterEach(cleanup);

  it("shows the search of the URL again after Back", () => {
    const { rerender } = render(renderForm("B"));
    const input = screen.getByRole("searchbox", {
      name: "Buscar por nombre o correo",
    });

    // Back: the URL search goes from B to A.
    rerender(renderForm("A"));

    expect(input).toHaveProperty("value", "A");
  });

  it("sends the trimmed text, or no search for empty text", () => {
    const onSearch = vi.fn<(value: string | undefined) => void>();
    render(
      <SearchForm
        label="Buscar"
        onSearch={onSearch}
        placeholder=""
        value={undefined}
      />
    );
    const input = screen.getByRole("searchbox", { name: "Buscar" });

    fireEvent.change(input, { target: { value: "  ana " } });
    fireEvent.submit(input);
    fireEvent.change(input, { target: { value: " " } });
    fireEvent.submit(input);

    expect(onSearch.mock.calls).toStrictEqual([["ana"], [undefined]]);
  });
});
