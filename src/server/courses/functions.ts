import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { httpError, throwNotFound } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";

import { cancelEnrollment, enrollInCourse, listCourses } from "./courses";
import type { EnrollOutcome } from "./courses";

/** The citizen reads these messages, so each one says what to do next. */
const ENROLL_MESSAGES: Record<
  Extract<EnrollOutcome, { ok: false }>["reason"],
  string
> = {
  no_citizen: "Link your document in your account before you enroll.",
  session_not_found:
    "This course session is not available. Select another one.",
  session_started: "This course session already started. Select another one.",
  session_full: "This course session is full. Select another one.",
  already_enrolled: "You are already enrolled in this course session.",
  obligation_not_eligible:
    "The discount applies to a pending fine of yours. Select one of your fines.",
  fine_already_enrolled:
    "This fine already has a course enrollment. Select another fine, or cancel that enrollment.",
};

/** The open course sessions, the enrollments of the signed-in citizen, and the fines that can get a discount. */
export const listCoursesFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ course: ["read"] })])
  .handler(
    async ({ context }) => await listCourses(db, { userId: context.user.id })
  );

/** Enrolls the signed-in citizen and returns the enrollment as it is stored. */
export const enrollInCourseFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["enroll"] })])
  .validator(z.object({ courseSessionId: z.uuid(), obligationId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const outcome = await enrollInCourse(db, {
      userId: context.user.id,
      actorId: context.actorId,
      ...data,
    });
    if (!outcome.ok) {
      throw httpError(
        outcome.reason === "session_not_found" ? 404 : 409,
        ENROLL_MESSAGES[outcome.reason]
      );
    }
    return outcome.enrollment;
  });

/** Cancels an enrollment of the signed-in citizen and returns it as it is stored. */
export const cancelEnrollmentFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["enroll"] })])
  .validator(z.object({ enrollmentId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const outcome = await cancelEnrollment(db, {
      userId: context.user.id,
      actorId: context.actorId,
      enrollmentId: data.enrollmentId,
    });
    if (!outcome.ok) {
      if (outcome.reason === "not_found") {
        return throwNotFound();
      }
      throw httpError(
        409,
        "This enrollment cannot be cancelled: the session started or you did not attend it."
      );
    }
    return outcome.enrollment;
  });
