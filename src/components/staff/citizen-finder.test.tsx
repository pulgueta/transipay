import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CitizenFinder } from "./citizen-finder";
import type { FindCitizen, FoundCitizen } from "./citizen-finder";

const found: FoundCitizen = {
  id: "0199c0a4-0000-7000-8000-000000000001",
  firstName: "Ana",
  lastName: "Ruiz",
  documentType: "CC",
  documentNumber: "10987654",
};

/** The finder shows `found` as the selected citizen. `useMutation` needs a query client. */
const renderFinder = (
  onChange: (citizen: FoundCitizen | null) => void,
  findCitizen: FindCitizen
) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CitizenFinder
        citizen={found}
        findCitizen={findCitizen}
        idPrefix="test"
        onChange={onChange}
      />
    </QueryClientProvider>
  );
  return screen.getByLabelText("Número de documento");
};

describe(CitizenFinder, () => {
  afterEach(cleanup);

  it("clears the selected citizen when the document number changes", () => {
    const onChange = vi.fn<(citizen: FoundCitizen | null) => void>();
    const input = renderFinder(onChange, vi.fn<FindCitizen>());

    fireEvent.change(input, { target: { value: "1" } });

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("clears the selected citizen when a lookup has an invalid document", async () => {
    const onChange = vi.fn<(citizen: FoundCitizen | null) => void>();
    const findCitizen = vi.fn<FindCitizen>();
    const input = renderFinder(onChange, findCitizen);
    fireEvent.change(input, { target: { value: "1" } });
    onChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Buscar ciudadano" }));

    await expect(
      screen.findByText("Escriba de 4 a 20 letras o números.")
    ).resolves.toBeDefined();
    expect(onChange).toHaveBeenCalledWith(null);
    expect(findCitizen).not.toHaveBeenCalled();
  });
});
