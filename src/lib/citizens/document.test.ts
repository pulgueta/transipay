import { describe, expect, it } from "vitest";

import { documentNumberSchema, normalizeDocumentNumber } from "./document";

describe(normalizeDocumentNumber, () => {
  it("removes spaces, points, and hyphens, and makes letters uppercase", () => {
    expect(normalizeDocumentNumber(" ab-12.34 5 ")).toBe("AB12345");
    expect(normalizeDocumentNumber("1.098.765.432")).toBe("1098765432");
  });

  it("does not change a canonical number", () => {
    expect(normalizeDocumentNumber("AB1234")).toBe("AB1234");
  });
});

describe("the document number schema", () => {
  it("gives the canonical number", () => {
    expect(documentNumberSchema.parse("ab 1.234-5")).toBe("AB12345");
  });

  it("refuses a number that is too short after normalization or has other characters", () => {
    expect(documentNumberSchema.safeParse("1.2-3").success).toBeFalsy();
    expect(documentNumberSchema.safeParse("AB_1234").success).toBeFalsy();
    expect(documentNumberSchema.safeParse("1".repeat(21)).success).toBeFalsy();
  });
});
