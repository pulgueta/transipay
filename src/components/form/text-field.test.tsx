import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAppForm } from "./use-app-form";

const FormFixture = ({ error }: { error: string | { message: string } }) => {
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: () => {},
  });

  return (
    <form.AppField
      name="name"
      validators={{ onBlur: ({ value }) => (value ? undefined : error) }}
    >
      {(field) => <field.TextField label="Name" />}
    </form.AppField>
  );
};

describe("TextField validation", () => {
  afterEach(cleanup);

  it("shows a string error after blur", () => {
    render(<FormFixture error="Name is required" />);
    fireEvent.blur(screen.getByRole("textbox", { name: "Name" }));

    expect(screen.getByRole("alert").textContent).toBe("Name is required");
  });

  it("shows an object message after blur", () => {
    render(<FormFixture error={{ message: "Name is required" }} />);
    fireEvent.blur(screen.getByRole("textbox", { name: "Name" }));

    expect(screen.getByRole("alert").textContent).toBe("Name is required");
  });
});
