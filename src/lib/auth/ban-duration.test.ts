import { describe, expect, it } from "vitest";

import { banDaysToSeconds } from "./ban-duration";

describe(banDaysToSeconds, () => {
  it("gives the duration in seconds, the unit of better-auth `banExpiresIn`", () => {
    expect(banDaysToSeconds("1")).toBe(86_400);
    expect(banDaysToSeconds("7")).toBe(604_800);
  });

  it("gives no duration for an empty, zero, negative, or decimal value", () => {
    expect(banDaysToSeconds("")).toBeUndefined();
    expect(banDaysToSeconds("0")).toBeUndefined();
    expect(banDaysToSeconds("-3")).toBeUndefined();
    expect(banDaysToSeconds("1.5")).toBeUndefined();
  });
});
