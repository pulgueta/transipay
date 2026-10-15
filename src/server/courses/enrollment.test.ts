import { describe, expect, it } from "vitest";

import { canCancelEnrollment, enrollmentDecision } from "./enrollment";

const now = new Date("2026-10-14T15:00:00Z");
const session = {
  startsAt: new Date("2026-10-20T15:00:00Z"),
  capacity: 2,
  enrolledCount: 1,
};
const fine = {
  kind: "fine",
  status: "pending",
  hasLiveEnrollment: false,
} as const;

describe(enrollmentDecision, () => {
  it("accepts a pending fine for an open session with a seat", () => {
    expect(
      enrollmentDecision(
        { session, alreadyEnrolled: false, obligation: fine },
        now
      )
    ).toStrictEqual({ ok: true });
  });

  it("refuses a session that started", () => {
    expect(
      enrollmentDecision(
        {
          session: { ...session, startsAt: now },
          alreadyEnrolled: false,
          obligation: fine,
        },
        now
      )
    ).toStrictEqual({ ok: false, reason: "session_started" });
  });

  it("refuses a full session", () => {
    expect(
      enrollmentDecision(
        {
          session: { ...session, enrolledCount: 2 },
          alreadyEnrolled: false,
          obligation: fine,
        },
        now
      )
    ).toStrictEqual({ ok: false, reason: "session_full" });
  });

  it("refuses a second enrollment in the same session", () => {
    expect(
      enrollmentDecision(
        { session, alreadyEnrolled: true, obligation: fine },
        now
      )
    ).toStrictEqual({ ok: false, reason: "already_enrolled" });
  });

  it("refuses an obligation that is not a pending fine of the citizen", () => {
    expect(
      enrollmentDecision(
        { session, alreadyEnrolled: false, obligation: null },
        now
      )
    ).toStrictEqual({ ok: false, reason: "obligation_not_eligible" });
    expect(
      enrollmentDecision(
        {
          session,
          alreadyEnrolled: false,
          obligation: { ...fine, kind: "procedure" },
        },
        now
      )
    ).toStrictEqual({ ok: false, reason: "obligation_not_eligible" });
    expect(
      enrollmentDecision(
        {
          session,
          alreadyEnrolled: false,
          obligation: { ...fine, status: "paid" },
        },
        now
      )
    ).toStrictEqual({ ok: false, reason: "obligation_not_eligible" });
  });

  it("refuses a fine that already has a live enrollment", () => {
    expect(
      enrollmentDecision(
        {
          session,
          alreadyEnrolled: false,
          obligation: { ...fine, hasLiveEnrollment: true },
        },
        now
      )
    ).toStrictEqual({ ok: false, reason: "fine_already_enrolled" });
  });
});

describe(canCancelEnrollment, () => {
  it("allows only an enrolled status before the session starts", () => {
    expect(
      canCancelEnrollment(
        { status: "enrolled", startsAt: session.startsAt },
        now
      )
    ).toBeTruthy();
    expect(
      canCancelEnrollment({ status: "enrolled", startsAt: now }, now)
    ).toBeFalsy();
    expect(
      canCancelEnrollment(
        { status: "attended", startsAt: session.startsAt },
        now
      )
    ).toBeFalsy();
  });
});
