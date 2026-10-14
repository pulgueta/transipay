import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useAppForm } from "./use-app-form";

const FormFixture = ({
  describedBy,
  error,
}: {
  describedBy?: string;
  error: string | { message: string };
}) => {
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: () => {},
  });

  return (
    <form.AppField
      name="name"
      validators={{ onBlur: ({ value }) => (value ? undefined : error) }}
    >
      {(field) => (
        <field.TextField aria-describedby={describedBy} label="Name" />
      )}
    </form.AppField>
  );
};

const describedByIds = (element: HTMLElement) =>
  (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean);

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

  it("links the error to the input only while the error shows", () => {
    render(<FormFixture error="Name is required" />);
    const input = screen.getByRole("textbox", { name: "Name" });

    expect(input.hasAttribute("aria-describedby")).toBeFalsy();

    fireEvent.blur(input);

    expect(describedByIds(input)).toStrictEqual([screen.getByRole("alert").id]);
  });

  it("keeps the description that the caller gives", () => {
    render(<FormFixture describedBy="name-hint" error="Name is required" />);
    const input = screen.getByRole("textbox", { name: "Name" });
    fireEvent.blur(input);

    expect(describedByIds(input)).toStrictEqual([
      "name-hint",
      screen.getByRole("alert").id,
    ]);
  });
});

const EmailForm = ({ label }: { label: string }) => {
  const form = useAppForm({
    defaultValues: { email: "" },
    onSubmit: () => {},
  });

  return (
    <form aria-label={label}>
      <form.AppField name="email">
        {(field) => <field.TextField label="Email" />}
      </form.AppField>
    </form>
  );
};

describe("TextField ids", () => {
  afterEach(cleanup);

  it("links each label to the input in its own form", () => {
    render(
      <>
        <EmailForm label="Sign in" />
        <EmailForm label="Sign up" />
      </>
    );

    const signIn = within(screen.getByRole("form", { name: "Sign in" }));
    const signUp = within(screen.getByRole("form", { name: "Sign up" }));
    const signInInput = signIn.getByRole("textbox", { name: "Email" });
    const signUpInput = signUp.getByRole("textbox", { name: "Email" });

    expect(screen.getAllByLabelText("Email")).toStrictEqual([
      signInInput,
      signUpInput,
    ]);
    expect(signInInput.id).not.toBe(signUpInput.id);
    expect(signInInput.getAttribute("name")).toBe("email");
  });
});
