import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

  it("ignores the result of a lookup when the document changed before it came back", async () => {
    const onChange = vi.fn<(citizen: FoundCitizen | null) => void>();
    const lookups: ((citizen: FoundCitizen | null) => void)[] = [];
    // The test decides when each lookup comes back.
    const findCitizen = vi.fn<FindCitizen>(async () => {
      const pending = Promise.withResolvers<FoundCitizen | null>();
      lookups.push(pending.resolve);
      return await pending.promise;
    });
    const input = renderFinder(onChange, findCitizen);
    const search = screen.getByRole("button", { name: "Buscar ciudadano" });
    const other: FoundCitizen = {
      ...found,
      id: "b",
      documentNumber: "20000000",
    };

    // Search for A, then change the document to B and search for B before A comes back.
    fireEvent.change(input, { target: { value: found.documentNumber } });
    fireEvent.click(search);
    await waitFor(() => {
      expect(findCitizen).toHaveBeenCalledOnce();
    });
    fireEvent.change(input, { target: { value: other.documentNumber } });
    fireEvent.click(search);
    await waitFor(() => {
      expect(findCitizen).toHaveBeenCalledTimes(2);
    });
    onChange.mockClear();

    // B comes back first, then the old lookup of A.
    await act(async () => {
      lookups[1]?.(other);
      lookups[0]?.(found);
      await Promise.resolve();
    });

    expect(onChange.mock.calls).toStrictEqual([[other]]);
  });

  it("does not select a citizen when the old lookup comes back after the document changed", async () => {
    const onChange = vi.fn<(citizen: FoundCitizen | null) => void>();
    const lookups: ((citizen: FoundCitizen | null) => void)[] = [];
    // The test decides when each lookup comes back.
    const findCitizen = vi.fn<FindCitizen>(async () => {
      const pending = Promise.withResolvers<FoundCitizen | null>();
      lookups.push(pending.resolve);
      return await pending.promise;
    });
    const input = renderFinder(onChange, findCitizen);
    fireEvent.change(input, { target: { value: found.documentNumber } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar ciudadano" }));
    await waitFor(() => {
      expect(findCitizen).toHaveBeenCalledOnce();
    });
    fireEvent.change(input, { target: { value: "20000000" } });
    onChange.mockClear();

    await act(async () => {
      lookups[0]?.(found);
      await Promise.resolve();
    });

    expect(onChange).not.toHaveBeenCalledWith(found);
  });
});
