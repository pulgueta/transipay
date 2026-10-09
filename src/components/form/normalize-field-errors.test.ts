import { describe, expect, it } from "vitest";

import { normalizeFieldErrors } from "./normalize-field-errors";

describe("field error normalization", () => {
  it("wraps string errors for FieldError", () => {
    expect(normalizeFieldErrors(["Required"])).toStrictEqual([
      { message: "Required" },
    ]);
  });

  it("keeps message errors for FieldError", () => {
    expect(normalizeFieldErrors([{ message: "Invalid email" }])).toStrictEqual([
      { message: "Invalid email" },
    ]);
  });

  it("ignores values without a string message", () => {
    expect(
      normalizeFieldErrors([undefined, null, { message: 7 }])
    ).toStrictEqual([]);
  });
});
