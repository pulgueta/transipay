import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { db } from "@/server/db/client";
import { pageInputSchema } from "@/server/db/pagination";
import { httpError } from "@/server/http-error";
import { requirePermission } from "@/server/middleware/auth";
import { staffScopeFor } from "@/server/staff/scope";

import { createCourseSession, listCourseSessions } from "./staff-sessions";
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
};

const CREATE_STATUSES: Record<CreateSessionRefusal, number> = {
  entity_not_in_scope: 403,
  entity_inactive: 409,
  entity_cannot_give_courses: 409,
  branch_not_found: 404,
  ends_before_start: 400,
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
      discountPercent: z.int().min(0).max(100),
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
