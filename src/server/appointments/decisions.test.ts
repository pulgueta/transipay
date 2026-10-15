import { describe, expect, it } from "vitest";

import {
  MIN_LEAD_MS,
  canCancelAppointment,
  canSchedule,
  earliestScheduledAt,
} from "./decisions";

const now = new Date("2026-10-14T15:00:00Z");

describe(canCancelAppointment, () => {
  it("allows a scheduled appointment in the future", () => {
    expect(
      canCancelAppointment(
        { status: "scheduled", scheduledAt: new Date("2026-10-15T15:00:00Z") },
        now
      )
    ).toStrictEqual({ ok: true });
  });

  it("refuses an appointment that already started", () => {
    expect(
      canCancelAppointment(
        { status: "scheduled", scheduledAt: new Date("2026-10-14T14:00:00Z") },
        now
      )
    ).toStrictEqual({ ok: false, reason: "in_the_past" });
  });

  it("refuses an appointment that is not scheduled", () => {
    expect(
      canCancelAppointment(
        { status: "cancelled", scheduledAt: new Date("2026-10-15T15:00:00Z") },
        now
      )
    ).toStrictEqual({ ok: false, reason: "not_scheduled" });
  });
});

describe(canSchedule, () => {
  it("accepts a time at least one hour from now", () => {
    expect(canSchedule(earliestScheduledAt(now), now)).toBeTruthy();
    expect(
      canSchedule(new Date(now.getTime() + MIN_LEAD_MS - 1), now)
    ).toBeFalsy();
  });
});
