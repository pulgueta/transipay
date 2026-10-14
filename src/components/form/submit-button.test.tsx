import { setTimeout as delay } from "node:timers/promises";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAppForm } from "./use-app-form";

const SignUpForm = ({
  onSubmit,
}: {
  onSubmit: (values: { email: string; name: string }) => Promise<void>;
}) => {
  const form = useAppForm({
    defaultValues: { email: "", name: "" },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: {
      onChange: ({ value }) =>
        value.email ? undefined : { fields: { email: "Email is required" } },
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" />}
      </form.AppField>
      <form.AppField name="email">
        {(field) => <field.TextField label="Email" />}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>Sign up</form.SubmitButton>
      </form.AppForm>
    </form>
  );
};

const button = () => screen.getByRole("button", { name: "Sign up" });

describe("SubmitButton", () => {
  afterEach(cleanup);

  it("stays enabled and shows hidden errors when the form is invalid", async () => {
    const onSubmit = vi.fn<() => Promise<void>>(async () => {});
    render(<SignUpForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
      target: { value: "Ana" },
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(button()).toHaveProperty("disabled", false);

    fireEvent.click(button());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Email is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is disabled while the form submits", async () => {
    const onSubmit = vi.fn<() => Promise<void>>(async () => {
      await delay(50);
    });
    render(<SignUpForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), {
      target: { value: "ana@example.com" },
    });
    fireEvent.click(button());

    await waitFor(() => {
      expect(button()).toHaveProperty("disabled", true);
    });
    expect(onSubmit).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(button()).toHaveProperty("disabled", false);
    });
  });
});
