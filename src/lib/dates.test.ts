import { describe, expect, it } from "vitest";

import {
  bogotaDateString,
  formatBogotaDate,
  formatBogotaDateTime,
  toDateTimeLocalValue,
} from "./dates";

describe(formatBogotaDateTime, () => {
  it("shows the instant in the Bogota time zone", () => {
    expect(formatBogotaDateTime(new Date("2026-10-14T15:30:00Z"))).toBe(
      "Oct 14, 2026, 10:30 AM"
    );
  });
});

describe(formatBogotaDate, () => {
  it("shows a calendar date without a time zone shift", () => {
    expect(formatBogotaDate("2026-10-20")).toBe("Oct 20, 2026");
  });
});

describe(bogotaDateString, () => {
  it("gives the calendar date in Bogota, also late in the UTC day", () => {
    expect(bogotaDateString(new Date("2026-10-15T03:00:00Z"))).toBe(
      "2026-10-14"
    );
  });
});

describe(toDateTimeLocalValue, () => {
  it("formats a local date for a datetime-local input", () => {
    expect(toDateTimeLocalValue(new Date(2026, 9, 14, 9, 5))).toBe(
      "2026-10-14T09:05"
    );
  });
});
