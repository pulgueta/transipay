import { describe, expect, it } from "vitest";

import { formatAmount } from "./-format-amount";

const digits = (text: string) => text.replaceAll(/\D/gu, "");

describe(formatAmount, () => {
  it("keeps the cents of an amount", () => {
    expect(digits(formatAmount(1_234_567, "COP"))).toBe("1234567");
  });

  it("shows no cents for a whole amount", () => {
    expect(digits(formatAmount(1_234_500, "COP"))).toBe("12345");
  });
});
