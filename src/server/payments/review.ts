import "@tanstack/react-start/server-only";
import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { toPage } from "@/server/db/pagination";
import type { PageInput } from "@/server/db/pagination";
import { citizen } from "@/server/db/schema/citizens";
import { obligation } from "@/server/db/schema/obligations";
import { payment, paymentAttempt } from "@/server/db/schema/payments";
import { runAsActor } from "@/server/db/with-actor";

/**
 * The attempts that wait for staff: a review reason is set (see `PAYMENT_ATTEMPT_REVIEW_REASONS`).
 * Newest attempt first. Keyset on the attempt id.
 */
export const listPaymentsUnderReview = async (
  database: Database,
  input: Required<Pick<PageInput, "limit">> & Pick<PageInput, "cursor">
) => {
  const rows = await database
    .select({
      id: paymentAttempt.id,
      attemptId: paymentAttempt.id,
      paymentId: payment.id,
      reviewReason: paymentAttempt.reviewReason,
      amountInCents: paymentAttempt.amountInCents,
      currency: paymentAttempt.currency,
      attemptStatus: paymentAttempt.status,
      paymentStatus: payment.status,
      finalizedAt: paymentAttempt.finalizedAt,
      createdAt: paymentAttempt.createdAt,
      obligationId: obligation.id,
      obligationNumber: obligation.number,
      obligationKind: obligation.kind,
      citizenDocument: sql<string>`${citizen.documentType} || ' ' || ${citizen.documentNumber}`,
      citizenName: sql<string>`${citizen.firstName} || ' ' || ${citizen.lastName}`,
    })
    .from(paymentAttempt)
    .innerJoin(payment, eq(payment.id, paymentAttempt.paymentId))
    .innerJoin(obligation, eq(obligation.id, payment.obligationId))
    .innerJoin(citizen, eq(citizen.id, payment.citizenId))
    .where(
      and(
        isNotNull(paymentAttempt.reviewReason),
        input.cursor === undefined
          ? undefined
          : lt(paymentAttempt.id, input.cursor)
      )
    )
    .orderBy(desc(paymentAttempt.id))
    .limit(input.limit + 1);
  return toPage(rows, input.limit);
};

export type ClearReviewOutcome =
  | {
      ok: true;
      attempt: typeof paymentAttempt.$inferSelect;
    }
  | { ok: false; reason: "attempt_not_found" | "not_under_review" };

/**
 * Records that staff examined the attempt: the review reason becomes null.
 * It changes nothing else. A refund or a manual payment of the obligation is a separate decision.
 * The payment row does not change, so the attempt stays the only evidence of the decision (with the audit log).
 */
export const clearPaymentReview = async (
  database: Database,
  input: { actorId: string; attemptId: string }
): Promise<ClearReviewOutcome> =>
  await runAsActor(database, input.actorId, async (tx) => {
    const [current] = await tx
      .select({ reviewReason: paymentAttempt.reviewReason })
      .from(paymentAttempt)
      .where(eq(paymentAttempt.id, input.attemptId))
      .for("update");
    if (current === undefined) {
      return { ok: false, reason: "attempt_not_found" };
    }
    if (current.reviewReason === null) {
      return { ok: false, reason: "not_under_review" };
    }
    const [attempt] = await tx
      .update(paymentAttempt)
      .set({ reviewReason: null })
      .where(eq(paymentAttempt.id, input.attemptId))
      .returning();
    if (attempt === undefined) {
      throw new Error("The attempt update returned no row.");
    }
    return { ok: true, attempt };
  });
