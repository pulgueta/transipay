import "@tanstack/react-start/server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";

import { canGiveCourses } from "@/lib/courses/course-entities";
import type { Database } from "@/server/db/client";
import { toPage } from "@/server/db/pagination";
import { branch, entity } from "@/server/db/schema/entities";
import { courseEnrollment, courseSession } from "@/server/db/schema/scheduling";
import { runAsActor } from "@/server/db/with-actor";
import { isInScope } from "@/server/staff/scope";
import type { StaffScope } from "@/server/staff/scope";

const scopeFilter = (scope: StaffScope) =>
  scope.kind === "all"
    ? undefined
    : inArray(courseSession.entityId, scope.entityIds);

/** The course sessions of the scope, newest first, with the count of enrollments that are not cancelled. */
export const listCourseSessions = async (
  database: Database,
  input: { scope: StaffScope; cursor?: string; limit: number }
) => {
  const rows = await database
    .select({
      id: courseSession.id,
      entityName: entity.name,
      branchName: branch.name,
      startsAt: courseSession.startsAt,
      endsAt: courseSession.endsAt,
      capacity: courseSession.capacity,
      discountPercent: courseSession.discountPercent,
      enrolledCount: database.$count(
        courseEnrollment,
        and(
          eq(courseEnrollment.courseSessionId, courseSession.id),
          sql`${courseEnrollment.status} <> 'cancelled'`
        )
      ),
    })
    .from(courseSession)
    .innerJoin(entity, eq(entity.id, courseSession.entityId))
    .innerJoin(branch, eq(branch.id, courseSession.branchId))
    .where(
      and(
        scopeFilter(input.scope),
        input.cursor === undefined
          ? undefined
          : lt(courseSession.id, input.cursor)
      )
    )
    .orderBy(desc(courseSession.id))
    .limit(input.limit + 1);
  return toPage(rows, input.limit);
};

export type CreateSessionRefusal =
  | "entity_not_in_scope"
  | "entity_inactive"
  | "entity_cannot_give_courses"
  | "branch_not_found"
  | "ends_before_start";

export type CreateSessionOutcome =
  | { ok: true; session: typeof courseSession.$inferSelect }
  | { ok: false; reason: CreateSessionRefusal };

export interface CreateSessionInput {
  actorId: string;
  entityId: string;
  branchId: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  discountPercent: number;
  scope: StaffScope;
}

/**
 * Creates a course session at a branch of the entity, with the actor in the audit log.
 * The entity must be active and give courses (a CEA or the transit authority).
 */
export const createCourseSession = async (
  database: Database,
  input: CreateSessionInput
): Promise<CreateSessionOutcome> => {
  if (!isInScope(input.scope, input.entityId)) {
    return { ok: false, reason: "entity_not_in_scope" };
  }
  if (input.endsAt <= input.startsAt) {
    return { ok: false, reason: "ends_before_start" };
  }
  return await runAsActor(database, input.actorId, async (tx) => {
    const [owner] = await tx
      .select({ kind: entity.kind, isActive: entity.isActive })
      .from(entity)
      .where(eq(entity.id, input.entityId))
      .for("share");
    if (owner === undefined || !canGiveCourses(owner.kind)) {
      return { ok: false, reason: "entity_cannot_give_courses" };
    }
    if (!owner.isActive) {
      return { ok: false, reason: "entity_inactive" };
    }
    const [place] = await tx
      .select({ id: branch.id })
      .from(branch)
      .where(
        and(
          eq(branch.id, input.branchId),
          eq(branch.entityId, input.entityId),
          eq(branch.isActive, true)
        )
      );
    if (place === undefined) {
      return { ok: false, reason: "branch_not_found" };
    }
    const [session] = await tx
      .insert(courseSession)
      .values({
        entityId: input.entityId,
        branchId: input.branchId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        capacity: input.capacity,
        discountPercent: input.discountPercent,
      })
      .returning();
    if (session === undefined) {
      throw new Error("The course session insert returned no row.");
    }
    return { ok: true, session };
  });
};
