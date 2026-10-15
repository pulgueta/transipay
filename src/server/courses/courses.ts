import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, gt, ne, notExists, sql } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { branch, entity } from "@/server/db/schema/entities";
import { fine, infraction, obligation } from "@/server/db/schema/obligations";
import { courseEnrollment, courseSession } from "@/server/db/schema/scheduling";
import { runAsActor } from "@/server/db/with-actor";

import { canCancelEnrollment, enrollmentDecision } from "./enrollment";
import type { EnrollmentRefusal } from "./enrollment";

const citizenIdOf = async (
  database: Database | Transaction,
  userId: string
) => {
  const mine = await database.query.citizen.findFirst({
    where: eq(citizen.userId, userId),
    columns: { id: true },
  });
  return mine?.id ?? null;
};

/** The live enrollments of a session. A cancelled enrollment frees its seat. */
const enrolledCount = sql<number>`(select count(*) from ${courseEnrollment}
  where ${courseEnrollment.courseSessionId} = ${courseSession.id} and ${courseEnrollment.status} <> 'cancelled')`.mapWith(
  Number
);

const sessionColumns = {
  id: courseSession.id,
  startsAt: courseSession.startsAt,
  endsAt: courseSession.endsAt,
  capacity: courseSession.capacity,
  discountPercent: courseSession.discountPercent,
  entityName: entity.name,
  branchName: branch.name,
  branchAddress: branch.address,
  enrolledCount,
};

const sessionQuery = (database: Database | Transaction) =>
  database
    .select(sessionColumns)
    .from(courseSession)
    .innerJoin(entity, eq(entity.id, courseSession.entityId))
    .innerJoin(branch, eq(branch.id, courseSession.branchId))
    .$dynamic();

const enrollmentColumns = {
  id: courseEnrollment.id,
  courseSessionId: courseEnrollment.courseSessionId,
  obligationId: courseEnrollment.obligationId,
  status: courseEnrollment.status,
  startsAt: courseSession.startsAt,
  endsAt: courseSession.endsAt,
  discountPercent: courseSession.discountPercent,
  entityName: entity.name,
  branchName: branch.name,
  obligationNumber: obligation.number,
};

const enrollmentQuery = (database: Database | Transaction) =>
  database
    .select(enrollmentColumns)
    .from(courseEnrollment)
    .innerJoin(
      courseSession,
      eq(courseSession.id, courseEnrollment.courseSessionId)
    )
    .innerJoin(entity, eq(entity.id, courseSession.entityId))
    .innerJoin(branch, eq(branch.id, courseSession.branchId))
    .innerJoin(obligation, eq(obligation.id, courseEnrollment.obligationId))
    .$dynamic();

type EnrollmentRow = Awaited<ReturnType<typeof enrollmentQuery>>[number];

const toEnrollmentView = (row: EnrollmentRow, now: Date) => ({
  ...row,
  canCancel: canCancelEnrollment(row, now),
});

export type EnrollmentView = ReturnType<typeof toEnrollmentView>;

/** The open sessions, the enrollments of the citizen, and the pending fines that can get a discount. */
export const listCourses = async (
  database: Database,
  input: { userId: string }
) => {
  const now = new Date();
  const citizenId = await citizenIdOf(database, input.userId);
  const sessions = await sessionQuery(database)
    .where(gt(courseSession.startsAt, now))
    .orderBy(asc(courseSession.startsAt));

  if (citizenId === null) {
    return {
      hasCitizen: false,
      sessions: sessions.map((row) => ({
        ...row,
        seatsLeft: row.capacity - row.enrolledCount,
        enrolled: false,
      })),
      enrollments: [],
      fines: [],
    };
  }

  const enrollments = await enrollmentQuery(database)
    .where(eq(courseEnrollment.citizenId, citizenId))
    .orderBy(desc(courseSession.startsAt));
  const liveSessionIds = new Set(
    enrollments
      .filter((row) => row.status !== "cancelled")
      .map((row) => row.courseSessionId)
  );
  const fines = await database
    .select({
      id: obligation.id,
      number: obligation.number,
      amountInCents: obligation.amountInCents,
      description: sql<string>`${infraction.code} || ' ' || ${infraction.description}`,
    })
    .from(obligation)
    .innerJoin(fine, eq(fine.obligationId, obligation.id))
    .innerJoin(infraction, eq(infraction.id, fine.infractionId))
    .where(
      and(
        eq(obligation.citizenId, citizenId),
        eq(obligation.status, "pending"),
        notExists(
          database
            .select({ id: courseEnrollment.id })
            .from(courseEnrollment)
            .where(
              and(
                eq(courseEnrollment.obligationId, obligation.id),
                ne(courseEnrollment.status, "cancelled")
              )
            )
        )
      )
    )
    .orderBy(desc(obligation.id));

  return {
    hasCitizen: true,
    sessions: sessions.map((row) => ({
      ...row,
      seatsLeft: row.capacity - row.enrolledCount,
      enrolled: liveSessionIds.has(row.id),
    })),
    enrollments: enrollments.map((row) => toEnrollmentView(row, now)),
    fines,
  };
};

export type EnrollOutcome =
  | { ok: true; enrollment: EnrollmentView }
  | {
      ok: false;
      reason: "no_citizen" | "session_not_found" | EnrollmentRefusal;
    };

/**
 * Enrolls the citizen in a session for a discount on one pending fine.
 * The session row lock makes parallel enrollments wait, so the capacity check sees the earlier one.
 * The composite foreign keys and the partial unique index enforce the same rules in the database.
 */
export const enrollInCourse = async (
  database: Database,
  input: {
    userId: string;
    actorId: string;
    courseSessionId: string;
    obligationId: string;
  }
): Promise<EnrollOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const citizenId = await citizenIdOf(tx, input.userId);
    if (citizenId === null) {
      return { ok: false, reason: "no_citizen" };
    }

    const locked = await tx
      .select({ id: courseSession.id })
      .from(courseSession)
      .where(eq(courseSession.id, input.courseSessionId))
      .for("update");
    if (locked.length === 0) {
      return { ok: false, reason: "session_not_found" };
    }
    const sessions = await sessionQuery(tx).where(
      eq(courseSession.id, input.courseSessionId)
    );
    const session = sessions.at(0);
    if (session === undefined) {
      return { ok: false, reason: "session_not_found" };
    }

    const mine = await tx
      .select({ id: courseEnrollment.id })
      .from(courseEnrollment)
      .where(
        and(
          eq(courseEnrollment.courseSessionId, session.id),
          eq(courseEnrollment.citizenId, citizenId),
          ne(courseEnrollment.status, "cancelled")
        )
      );
    const obligations = await tx
      .select({ kind: obligation.kind, status: obligation.status })
      .from(obligation)
      .where(
        and(
          eq(obligation.id, input.obligationId),
          eq(obligation.citizenId, citizenId)
        )
      );
    const liveForFine = await tx
      .select({ id: courseEnrollment.id })
      .from(courseEnrollment)
      .where(
        and(
          eq(courseEnrollment.obligationId, input.obligationId),
          ne(courseEnrollment.status, "cancelled")
        )
      );
    const target = obligations.at(0);

    const decision = enrollmentDecision(
      {
        session,
        alreadyEnrolled: mine.length > 0,
        obligation:
          target === undefined
            ? null
            : { ...target, hasLiveEnrollment: liveForFine.length > 0 },
      },
      new Date()
    );
    if (!decision.ok) {
      return decision;
    }

    // One row per citizen and session (unique key). After a cancel, the same row becomes live again.
    // Only a cancelled row changes. The checks above refuse a live enrollment.
    const [stored] = await tx
      .insert(courseEnrollment)
      .values({
        courseSessionId: session.id,
        citizenId,
        obligationId: input.obligationId,
      })
      .onConflictDoUpdate({
        target: [courseEnrollment.courseSessionId, courseEnrollment.citizenId],
        set: {
          obligationId: input.obligationId,
          status: "enrolled",
          attendedAt: null,
        },
        setWhere: eq(courseEnrollment.status, "cancelled"),
      })
      .returning({ id: courseEnrollment.id });
    if (stored === undefined) {
      throw new Error("The enrollment insert returned no row.");
    }
    const rows = await enrollmentQuery(tx).where(
      eq(courseEnrollment.id, stored.id)
    );
    const row = rows.at(0);
    if (row === undefined) {
      throw new Error("The enrollment was not found after the insert.");
    }
    return { ok: true, enrollment: toEnrollmentView(row, new Date()) };
  });

export type CancelEnrollmentOutcome =
  | { ok: true; enrollment: EnrollmentView }
  | { ok: false; reason: "not_found" | "cannot_cancel" };

/** Cancels an enrollment of the citizen before the session starts. Another user's enrollment is "not found". */
export const cancelEnrollment = async (
  database: Database,
  input: { userId: string; actorId: string; enrollmentId: string }
): Promise<CancelEnrollmentOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const rows = await tx
      .select({
        id: courseEnrollment.id,
        status: courseEnrollment.status,
        startsAt: courseSession.startsAt,
      })
      .from(courseEnrollment)
      .innerJoin(citizen, eq(citizen.id, courseEnrollment.citizenId))
      .innerJoin(
        courseSession,
        eq(courseSession.id, courseEnrollment.courseSessionId)
      )
      .where(
        and(
          eq(courseEnrollment.id, input.enrollmentId),
          eq(citizen.userId, input.userId)
        )
      )
      .for("update", { of: courseEnrollment });
    const current = rows.at(0);
    if (current === undefined) {
      return { ok: false, reason: "not_found" };
    }
    const now = new Date();
    if (!canCancelEnrollment(current, now)) {
      return { ok: false, reason: "cannot_cancel" };
    }

    await tx
      .update(courseEnrollment)
      .set({ status: "cancelled" })
      .where(eq(courseEnrollment.id, current.id));
    const after = await enrollmentQuery(tx).where(
      eq(courseEnrollment.id, current.id)
    );
    const row = after.at(0);
    if (row === undefined) {
      throw new Error("The enrollment was not found after the update.");
    }
    return { ok: true, enrollment: toEnrollmentView(row, now) };
  });
