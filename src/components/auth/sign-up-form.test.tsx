import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignUpForm } from "./sign-up-form";

describe(SignUpForm, () => {
  afterEach(cleanup);

  it("shows the password length message one time when the password is too short", async () => {
    render(<SignUpForm onSignUp={vi.fn<() => Promise<string | null>>()} />);

    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta" }));
    await screen.findAllByRole("alert");

    expect(screen.getAllByText("Use 12 caracteres o más.")).toHaveLength(1);
  });

  it("shows the password length hint before the user types", () => {
    render(<SignUpForm onSignUp={vi.fn<() => Promise<string | null>>()} />);

    expect(screen.getAllByText("Use 12 caracteres o más.")).toHaveLength(1);
  });
});
