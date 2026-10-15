import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";

const fillAndSubmit = (email: string, password: string) => {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

describe(SignInForm, () => {
  afterEach(cleanup);

  it("renders the email and password fields", () => {
    render(<SignInForm onSignIn={async () => await Promise.resolve(null)} />);

    expect(screen.getByLabelText("Email")).toHaveProperty("type", "email");
    expect(screen.getByLabelText("Password")).toHaveProperty(
      "type",
      "password"
    );
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined();
  });

  it("shows the field errors and does not sign in with empty fields", async () => {
    const onSignIn = vi.fn<() => Promise<string | null>>(
      async () => await Promise.resolve(null)
    );
    render(<SignInForm onSignIn={onSignIn} />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.map((alert) => alert.textContent)).toStrictEqual([
      "Enter your email address.",
      "Enter your password.",
    ]);
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it("sends the values and shows the error that the sign-in gives", async () => {
    const onSignIn = vi.fn<() => Promise<string | null>>(
      async () => await Promise.resolve("The email or password is not correct.")
    );
    render(<SignInForm onSignIn={onSignIn} />);

    fillAndSubmit("ana@example.com", "correct horse battery");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The email or password is not correct.");
    expect(onSignIn).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "correct horse battery",
    });
  });

  it("shows no error when the sign-in succeeds", async () => {
    render(<SignInForm onSignIn={async () => await Promise.resolve(null)} />);

    fillAndSubmit("ana@example.com", "correct horse battery");

    await vi.waitFor(() => {
      expect(screen.getByRole("button", { name: "Sign in" })).toHaveProperty(
        "disabled",
        false
      );
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
