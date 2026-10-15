import "@tanstack/react-start/server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { obligation } from "@/server/db/schema/obligations";
import { courseEnrollment, courseSession } from "@/server/db/schema/scheduling";
import { runAsActor } from "@/server/db/with-actor";
import type { StaffScope } from "@/server/staff/scope";

import { courseDiscountInCents } from "./enrollment";

/** The results that staff record for an enrollment after the session ends. */
export const ATTENDANCE_OUTCOMES = ["attended", "absent"] as const;

export type AttendanceOutcome = (typeof ATTENDANCE_OUTCOMES)[number];

const scopeFilter = (scope: StaffScope) =>
  scope.kind === "all"
    ? undefined
    : inArray(courseSession.entityId, scope.entityIds);

/**
 * The enrollments of a session that are not cancelled, by citizen name.
 * Null when the session is not in the scope, so staff cannot find out that it exists.
 */
export const listSessionEnrollments = async (
  database: Database,
  input: { courseSessionId: string; scope: StaffScope }
) => {
  const sessions = await database
    .select({ id: courseSession.id })
    .from(courseSession)
    .where(
      and(eq(courseSession.id, input.courseSessionId), scopeFilter(input.scope))
    );
  if (sessions.length === 0) {
    return null;
  }
  return await database
    .select({
      id: courseEnrollment.id,
      status: courseEnrollment.status,
      attendedAt: courseEnrollment.attendedAt,
      citizenName: sql<string>`${citizen.firstName} || ' ' || ${citizen.lastName}`,
      citizenDocument: sql<string>`${citizen.documentType} || ' ' || ${citizen.documentNumber}`,
      obligationNumber: obligation.number,
    })
    .from(courseEnrollment)
    .innerJoin(citizen, eq(citizen.id, courseEnrollment.citizenId))
    .innerJoin(obligation, eq(obligation.id, courseEnrollment.obligationId))
    .where(
      and(
        eq(courseEnrollment.courseSessionId, input.courseSessionId),
        ne(courseEnrollment.status, "cancelled")
      )
    )
    .orderBy(
      asc(citizen.firstName),
      asc(citizen.lastName),
      asc(courseEnrollment.id)
    );
};

const STORED_OBLIGATION = {
  id: obligation.id,
  status: obligation.status,
  amountInCents: obligation.amountInCents,
  discountInCents: obligation.discountInCents,
};

export type RecordAttendanceOutcome =
  | {
      ok: true;
      enrollment: typeof courseEnrollment.$inferSelect;
      obligation: {
        id: string;
        status: (typeof obligation.$inferSelect)["status"];
        amountInCents: number;
        discountInCents: number;
      };
    }
  | {
      ok: false;
      reason:
        | "enrollment_not_found"
        | "not_enrolled"
        | "not_ended"
        | "full_discount_not_supported";
    };

/**
 * Records that the citizen attended the session or was absent, in one transaction with the actor.
 * The enrollment must be `enrolled`, and the session must have ended (database clock),
 * because each result closes the enrollment and an attendance gives the discount.
 * An attendance gives the session discount on the fine only when the fine is still pending and has no discount,
 * so the discount applies one time only. An enrollment outside the scope reads as not found.
 * A discount must leave an amount to pay: a fine is settled only by a payment, and no flow closes a fine with
 * nothing due. So an attendance that makes the fine free is refused, and nothing changes.
 * Returns the enrollment and the obligation as stored after the write.
 */
export const recordAttendance = async (
  database: Database,
  input: {
    actorId: string;
    enrollmentId: string;
    outcome: AttendanceOutcome;
    scope: StaffScope;
  }
): Promise<RecordAttendanceOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const [current] = await tx
      .select({
        status: courseEnrollment.status,
        obligationId: courseEnrollment.obligationId,
        discountPercent: courseSession.discountPercent,
        ended: sql<boolean>`${courseSession.endsAt} <= now()`,
      })
      .from(courseEnrollment)
      .innerJoin(
        courseSession,
        eq(courseSession.id, courseEnrollment.courseSessionId)
      )
      .where(
        and(
          eq(courseEnrollment.id, input.enrollmentId),
          scopeFilter(input.scope)
        )
      )
      .for("update", { of: courseEnrollment });
    if (current === undefined) {
      return { ok: false, reason: "enrollment_not_found" };
    }
    if (current.status !== "enrolled") {
      return { ok: false, reason: "not_enrolled" };
    }
    if (!current.ended) {
      return { ok: false, reason: "not_ended" };
    }

    const [debt] = await tx
      .select(STORED_OBLIGATION)
      .from(obligation)
      .where(eq(obligation.id, current.obligationId))
      .for("update");
    if (debt === undefined) {
      throw new Error("The enrollment has no obligation.");
    }

    const getsDiscount =
      input.outcome === "attended" &&
      debt.status === "pending" &&
      debt.discountInCents === 0;
    const discountInCents = getsDiscount
      ? courseDiscountInCents(debt.amountInCents, current.discountPercent)
      : 0;
    if (getsDiscount && debt.amountInCents - discountInCents <= 0) {
      return { ok: false, reason: "full_discount_not_supported" };
    }

    const [enrollment] = await tx
      .update(courseEnrollment)
      .set({
        status: input.outcome,
        attendedAt: input.outcome === "attended" ? sql`now()` : null,
      })
      .where(eq(courseEnrollment.id, input.enrollmentId))
      .returning();
    if (enrollment === undefined) {
      throw new Error("The enrollment update returned no row.");
    }

    if (!getsDiscount) {
      return { ok: true, enrollment, obligation: debt };
    }
    const [discounted] = await tx
      .update(obligation)
      .set({ discountInCents })
      .where(eq(obligation.id, debt.id))
      .returning(STORED_OBLIGATION);
    if (discounted === undefined) {
      throw new Error("The obligation update returned no row.");
    }
    return { ok: true, enrollment, obligation: discounted };
  });
