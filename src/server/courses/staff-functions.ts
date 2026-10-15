import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { pageInputSchema } from "@/server/db/pagination";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { staffScopeFor } from "@/server/staff/scope";

import { listSessionEnrollments, recordAttendance } from "./staff-attendance";
import type {
  AttendanceOutcome,
  RecordAttendanceOutcome,
} from "./staff-attendance";
import {
  MAX_DISCOUNT_PERCENT,
  MIN_DISCOUNT_PERCENT,
  createCourseSession,
  listCourseSessions,
} from "./staff-sessions";
import type { CreateSessionRefusal } from "./staff-sessions";

/** The course sessions of the entities of the staff member (all for the admin), newest first. */
export const listCourseSessionsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ course: ["create"] })])
  .validator(pageInputSchema)
  .handler(
    async ({ context, data }) =>
      await listCourseSessions(db, {
        scope: await staffScopeFor(db, context.user),
        cursor: data.cursor,
        limit: data.limit,
      })
  );

const CREATE_MESSAGES: Record<CreateSessionRefusal, string> = {
  entity_not_in_scope: "You are not a staff member of this entity.",
  entity_inactive: "This entity is not active.",
  entity_cannot_give_courses:
    "This entity cannot give courses. Select a CEA or the transit authority.",
  branch_not_found:
    "This branch does not belong to the entity, or it is not active.",
  ends_before_start: "The end must be after the start.",
  discount_out_of_range: "Enter a discount from 1% to 99%.",
};

const CREATE_STATUSES: Record<CreateSessionRefusal, number> = {
  entity_not_in_scope: 403,
  entity_inactive: 409,
  entity_cannot_give_courses: 409,
  branch_not_found: 404,
  ends_before_start: 400,
  discount_out_of_range: 400,
};

/** Creates a course session. Returns the session as stored after the write. */
export const createCourseSessionFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["create"] })])
  .validator(
    z.object({
      entityId: z.uuid(),
      branchId: z.uuid(),
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      capacity: z.int().min(1).max(1000),
      discountPercent: z
        .int()
        .min(MIN_DISCOUNT_PERCENT)
        .max(MAX_DISCOUNT_PERCENT),
    })
  )
  .handler(async ({ context, data }) => {
    const outcome = await createCourseSession(db, {
      actorId: context.actorId,
      ...data,
      scope: await staffScopeFor(db, context.user),
    });
    if (!outcome.ok) {
      throw httpError(
        CREATE_STATUSES[outcome.reason],
        CREATE_MESSAGES[outcome.reason]
      );
    }
    return outcome.session;
  });

/** The enrollments of a session of the entities of the staff member, for the attendance dialog. */
export const listSessionEnrollmentsFn = createServerFn({ method: "GET" })
  .middleware([requirePermission({ course: ["update"] })])
  .validator(z.object({ courseSessionId: z.uuid() }))
  .handler(async ({ context, data }) => {
    const rows = await listSessionEnrollments(db, {
      courseSessionId: data.courseSessionId,
      scope: await staffScopeFor(db, context.user),
    });
    if (rows === null) {
      throw httpError(404, "We cannot find this course session.");
    }
    return rows;
  });

const ATTENDANCE_MESSAGES: Record<
  Extract<RecordAttendanceOutcome, { ok: false }>["reason"],
  string
> = {
  enrollment_not_found: "We cannot find this enrollment.",
  not_enrolled: "The attendance of this enrollment is already recorded.",
  not_ended:
    "This session did not end. You can record the attendance after its end.",
  full_discount_not_supported:
    "The session discount makes the fine free. You cannot record this attendance, because a fine closes only with a payment.",
};

/** Records the outcome and returns the enrollment and the obligation as stored after the write. */
const attend = async (
  user: { id: string; role?: string | null },
  actorId: string,
  enrollmentId: string,
  outcome: AttendanceOutcome
) => {
  const result = await recordAttendance(db, {
    actorId,
    enrollmentId,
    outcome,
    scope: await staffScopeFor(db, user),
  });
  if (!result.ok) {
    throw httpError(
      result.reason === "enrollment_not_found" ? 404 : 409,
      ATTENDANCE_MESSAGES[result.reason]
    );
  }
  return { enrollment: result.enrollment, obligation: result.obligation };
};

/** Records that the citizen completed the course. The fine gets the session discount one time (see `recordAttendance`). */
export const completeEnrollmentFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["update"] })])
  .validator(z.object({ enrollmentId: z.uuid() }))
  .handler(
    async ({ context, data }) =>
      await attend(context.user, context.actorId, data.enrollmentId, "attended")
  );

/** Records that the citizen did not come to the session. The fine gets no discount. */
export const markEnrollmentAbsentFn = createServerFn({ method: "POST" })
  .middleware([requirePermission({ course: ["update"] })])
  .validator(z.object({ enrollmentId: z.uuid() }))
  .handler(
    async ({ context, data }) =>
      await attend(context.user, context.actorId, data.enrollmentId, "absent")
  );
