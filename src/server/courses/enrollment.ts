import type {
  ObligationKind,
  ObligationStatus,
} from "@/server/db/schema/obligations";
import type { EnrollmentStatus } from "@/server/db/schema/scheduling";

export interface EnrollmentInput {
  session: { startsAt: Date; capacity: number; enrolledCount: number };
  /** True when the citizen has a live enrollment in this session. */
  alreadyEnrolled: boolean;
  /** The obligation of the citizen, or null when it is not theirs. */
  obligation: {
    kind: ObligationKind;
    status: ObligationStatus;
    /** True when another live enrollment already applies to this fine. */
    hasLiveEnrollment: boolean;
  } | null;
}

export type EnrollmentRefusal =
  | "session_started"
  | "session_full"
  | "already_enrolled"
  | "obligation_not_eligible"
  | "fine_already_enrolled";

export type EnrollmentDecision =
  | { ok: true }
  | { ok: false; reason: EnrollmentRefusal };

const refuse = (reason: EnrollmentRefusal): EnrollmentDecision => ({
  ok: false,
  reason,
});

/** Decides if the citizen can enroll. The discount applies to one pending fine of the citizen. */
export const enrollmentDecision = (
  input: EnrollmentInput,
  now: Date
): EnrollmentDecision => {
  if (input.session.startsAt.getTime() <= now.getTime()) {
    return refuse("session_started");
  }
  if (input.alreadyEnrolled) {
    return refuse("already_enrolled");
  }
  if (input.session.enrolledCount >= input.session.capacity) {
    return refuse("session_full");
  }
  if (
    input.obligation === null ||
    input.obligation.kind !== "fine" ||
    input.obligation.status !== "pending"
  ) {
    return refuse("obligation_not_eligible");
  }
  if (input.obligation.hasLiveEnrollment) {
    return refuse("fine_already_enrolled");
  }
  return { ok: true };
};

/** A citizen cancels only an enrollment that is `enrolled`, before the session starts. */
export const canCancelEnrollment = (
  enrollment: { status: EnrollmentStatus; startsAt: Date },
  now: Date
) =>
  enrollment.status === "enrolled" &&
  enrollment.startsAt.getTime() > now.getTime();
