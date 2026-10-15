import { describe, expect, it } from "vitest";

import { formatAmount } from "./format-amount";

// Intl puts a nonbreaking space between the symbol and the number.
const shown = (text: string) => text.replaceAll(" ", " ");

describe(formatAmount, () => {
  it("keeps the cents of an amount", () => {
    expect(shown(formatAmount(1_234_567, "COP"))).toBe("$ 12.345,67");
  });

  it("shows no cents for a whole amount", () => {
    expect(shown(formatAmount(1_234_500, "COP"))).toBe("$ 12.345");
  });
});
