import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { courseDiscountInCents } from "@/server/courses/enrollment";
import {
  MAX_DISCOUNT_PERCENT,
  MIN_DISCOUNT_PERCENT,
} from "@/server/courses/staff-sessions";

import {
  DEFAULT_PERCENT,
  MAX_PERCENT,
  MIN_PERCENT,
  calculatorSearchSchema,
  clampPercent,
  coursePayment,
  formatPesosInput,
  parsePesos,
} from "./course-discount";

describe(parsePesos, () => {
  it.each([
    ["621600", 621_600],
    ["621.600", 621_600],
    ["$ 621.600", 621_600],
    ["621,600", 621_600],
    ["1.234.567", 1_234_567],
  ])("reads %j as whole pesos", (text, pesos) => {
    expect(parsePesos(text)).toBe(pesos);
  });

  it("drops the cents that a person typed", () => {
    expect(parsePesos("621.600,50")).toBe(621_600);
    expect(parsePesos("621600.5")).toBe(621_600);
  });

  it.each(["", "   ", "abc", "0", "$ 0"])(
    "gives null for %j, because no amount is due",
    (text) => {
      expect(parsePesos(text)).toBeNull();
    }
  );

  it("gives null for an amount with too many digits", () => {
    expect(parsePesos("1".repeat(12))).toBeNull();
  });
});

describe(formatPesosInput, () => {
  it("puts a point between each group of three digits", () => {
    expect(formatPesosInput("621600")).toBe("621.600");
    expect(formatPesosInput("1234567")).toBe("1.234.567");
    expect(formatPesosInput("999")).toBe("999");
  });

  it("removes the characters that are not digits and the leading zeros", () => {
    expect(formatPesosInput("$ 0621.6a00")).toBe("621.600");
    expect(formatPesosInput("")).toBe("");
  });
});

describe(clampPercent, () => {
  it("has the limits of a course session", () => {
    expect(MIN_PERCENT).toBe(MIN_DISCOUNT_PERCENT);
    expect(MAX_PERCENT).toBe(MAX_DISCOUNT_PERCENT);
  });

  it("keeps a whole percent in the limits", () => {
    expect(clampPercent(1)).toBe(1);
    expect(clampPercent(37)).toBe(37);
    expect(clampPercent(99)).toBe(99);
  });

  it("moves a percent out of the limits to the nearest limit", () => {
    expect(clampPercent(0)).toBe(1);
    expect(clampPercent(-5)).toBe(1);
    expect(clampPercent(100)).toBe(99);
  });

  it("rounds a percent that is not whole", () => {
    expect(clampPercent(12.6)).toBe(13);
  });

  it("uses the default for a value that is not a number", () => {
    expect(clampPercent(Number.NaN)).toBe(DEFAULT_PERCENT);
  });
});

describe(coursePayment, () => {
  it("subtracts the discount from the amount", () => {
    expect(coursePayment(621_600, 50)).toStrictEqual({
      discountInCents: 31_080_000,
      payableInCents: 31_080_000,
    });
  });

  it("always leaves an amount to pay", () => {
    expect(coursePayment(1, 99).payableInCents).toBeGreaterThan(0);
  });

  it.each([
    [621_600, 1],
    [621_600, 37],
    [621_601, 33],
    [186_300, 25],
    [999, 99],
    [1, 50],
  ])(
    "gives the discount of the server rule for %i pesos at %i percent",
    (pesos, percent) => {
      const amountInCents = pesos * 100;
      const discountInCents = courseDiscountInCents(amountInCents, percent);

      expect(coursePayment(pesos, percent)).toStrictEqual({
        discountInCents,
        payableInCents: amountInCents - discountInCents,
      });
    }
  );
});

const readSearch = (search: z.input<typeof calculatorSearchSchema>) => {
  const { valor, descuento } = calculatorSearchSchema.parse(search);
  return [valor, descuento];
};

describe("the values of the calculator in the address", () => {
  it("reads the values of a form that was sent without script", () => {
    expect(readSearch({ valor: 621_600, descuento: 37 })).toStrictEqual([
      621_600, 37,
    ]);
  });

  it("gives no values for a link without them", () => {
    expect(readSearch({})).toStrictEqual([undefined, undefined]);
  });

  it.each([
    { valor: "abc" },
    { valor: 0 },
    { valor: -5 },
    { valor: 1.5 },
    { valor: 100_000_000_000 },
    { descuento: 0 },
    { descuento: 100 },
    { descuento: 12.5 },
    { descuento: "50%" },
  ])("ignores %j, so a bad link still opens the page", (search) => {
    expect(readSearch(search)).toStrictEqual([undefined, undefined]);
  });

  it("keeps the valid value when the other value is not valid", () => {
    expect(readSearch({ valor: 621_600, descuento: 150 })).toStrictEqual([
      621_600,
      undefined,
    ]);
  });
});
