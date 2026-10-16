import { describe, expect, it } from "vitest";

import {
  bogotaDateString,
  bogotaWallClockToInstant,
  formatBogotaDate,
  formatBogotaDateTime,
  toBogotaDateTimeLocalValue,
} from "./dates";

describe(formatBogotaDateTime, () => {
  it("shows the instant in the Bogota time zone", () => {
    expect(formatBogotaDateTime(new Date("2026-10-14T15:30:00Z"))).toBe(
      "14/10/2026, 10:30 a. m."
    );
  });
});

describe(formatBogotaDate, () => {
  it("shows a calendar date without a time zone shift", () => {
    expect(formatBogotaDate("2026-10-20")).toBe("20/10/2026");
  });
});

describe(bogotaDateString, () => {
  it("gives the calendar date in Bogota, also late in the UTC day", () => {
    expect(bogotaDateString(new Date("2026-10-15T03:00:00Z"))).toBe(
      "2026-10-14"
    );
  });
});

describe(bogotaWallClockToInstant, () => {
  it("reads a datetime-local value as Bogota time (UTC-05:00)", () => {
    expect(bogotaWallClockToInstant("2026-10-14T10:00").toISOString()).toBe(
      "2026-10-14T15:00:00.000Z"
    );
  });

  it("moves to the next UTC day for a late Bogota time", () => {
    expect(bogotaWallClockToInstant("2026-12-31T21:30").toISOString()).toBe(
      "2027-01-01T02:30:00.000Z"
    );
  });

  it("accepts seconds", () => {
    expect(bogotaWallClockToInstant("2026-10-14T10:00:30").toISOString()).toBe(
      "2026-10-14T15:00:30.000Z"
    );
  });

  it.each([
    "",
    "2026-10-14",
    "2026-10-14T10:00Z",
    "2026-13-01T10:00",
    "2026-02-30T10:00",
  ])("refuses the value %j", (value) => {
    expect(() => bogotaWallClockToInstant(value)).toThrow(RangeError);
  });
});

describe(toBogotaDateTimeLocalValue, () => {
  it("formats an instant as Bogota time for a datetime-local input", () => {
    expect(toBogotaDateTimeLocalValue(new Date("2026-10-15T02:05:00Z"))).toBe(
      "2026-10-14T21:05"
    );
  });

  it("gives back the same instant through bogotaWallClockToInstant", () => {
    const instant = new Date("2026-10-14T15:00:00Z");
    expect(
      bogotaWallClockToInstant(toBogotaDateTimeLocalValue(instant))
    ).toStrictEqual(instant);
  });
});
