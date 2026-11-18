import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookingForm } from "./booking-form";

type Options = ComponentProps<typeof BookingForm>["options"];

const options: Options = {
  hasCitizen: true,
  entities: [
    {
      id: "e1",
      name: "ITTB",
      kind: "transit_authority",
      branches: [{ id: "b1", name: "Sede centro", address: "Calle 1" }],
      procedureTypes: [{ id: "p1", name: "Licencia", amountInCents: 0 }],
    },
  ],
  obligations: [],
};

describe(BookingForm, () => {
  afterEach(cleanup);

  it("disables the branch and the procedure type until an entity is selected", () => {
    render(
      <BookingForm
        onBook={vi.fn<() => Promise<string | null>>()}
        options={options}
      />
    );

    expect(screen.getByLabelText("Sede")).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Trámite")).toHaveProperty("disabled", true);
  });

  it("moves the focus to the first invalid field when the submit fails", async () => {
    const onBook = vi.fn<() => Promise<string | null>>();
    render(<BookingForm onBook={onBook} options={options} />);

    const submit = screen.getByRole("button", { name: "Agendar cita" });
    submit.focus();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByLabelText("Entidad"));
    });
    expect(onBook).not.toHaveBeenCalled();
  });
});
