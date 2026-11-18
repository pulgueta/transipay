import { describe, expect, it } from "vitest";

import { fineItems } from "./enroll-dialog";

describe(fineItems, () => {
  it("puts the fine number in each option, so two fines with the same infraction are different", () => {
    const items = fineItems([
      {
        id: "a",
        number: "F-1",
        description: "C02 Estacionar en sitio prohibido",
        amountInCents: 62_160_000,
      },
      {
        id: "b",
        number: "F-2",
        description: "C02 Estacionar en sitio prohibido",
        amountInCents: 62_160_000,
      },
    ]);

    expect(items.map((item) => item.value)).toStrictEqual(["a", "b"]);
    expect(items[0]?.label).toContain("F-1");
    expect(items[1]?.label).toContain("F-2");
    expect(items[0]?.label).not.toBe(items[1]?.label);
  });
});
