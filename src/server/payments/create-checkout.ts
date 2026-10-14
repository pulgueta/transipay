import "@tanstack/react-start/server-only";
import { and, desc, eq, isNull } from "drizzle-orm";

import type { Database, Transaction } from "@/server/db/client";
import { citizen } from "@/server/db/schema/citizens";
import { obligation } from "@/server/db/schema/obligations";
import {
  installment,
  payment,
  paymentAgreement,
  paymentAttempt,
} from "@/server/db/schema/payments";
import { runAsActor } from "@/server/db/with-actor";

import { resolveAmountDue } from "./amount";
import type { AmountDueError } from "./amount";
import { decideCheckout } from "./checkout";
import type { ReconcileResult } from "./reconcile";

export interface CreateCheckoutDeps {
  database: Database;
  /** Makes one payment agree with Wompi before the decision (see `reconcilePayment`). */
  reconcile: (
    paymentId: string,
    actorUserId: string
  ) => Promise<ReconcileResult>;
}

export interface CreateCheckoutInput {
  /** The signed-in user. The obligation must belong to the citizen of this user. */
  userId: string;
  /** The audit actor (the admin during impersonation). */
  actorId: string;
  obligationId: string;
  installmentId: string | null;
}

export type CheckoutRefusal =
  | {
      reason:
        | "obligation_not_found"
        | "installment_not_found"
        | AmountDueError
        // Wompi could not tell the status of an earlier payment. Nothing starts until it can.
        | "earlier_payment_unavailable"
        | "payment_in_progress";
    }
  | { reason: "other_amount_open"; until: Date };

export type CheckoutOutcome =
  | {
      ok: true;
      payment: {
        id: string;
        reference: string;
        amountInCents: number;
        createdAt: Date;
      };
    }
  | ({ ok: false } & CheckoutRefusal);

const refuse = (refusal: CheckoutRefusal): CheckoutOutcome => ({
  ok: false,
  ...refusal,
});

const targetFilter = (input: CreateCheckoutInput) =>
  and(
    eq(payment.obligationId, input.obligationId),
    input.installmentId === null
      ? isNull(payment.installmentId)
      : eq(payment.installmentId, input.installmentId)
  );

/** Locks the active agreement, then the installment, and reads the installment. Null when it is not found. */
const lockInstallment = async (
  tx: Transaction,
  obligationId: string,
  installmentId: string
) => {
  const agreements = await tx
    .select({ id: paymentAgreement.id })
    .from(paymentAgreement)
    .where(
      and(
        eq(paymentAgreement.obligationId, obligationId),
        eq(paymentAgreement.status, "active")
      )
    )
    .for("update");
  const agreement = agreements.at(0);
  if (!agreement) {
    return null;
  }

  const installments = await tx
    .select({
      status: installment.status,
      amountInCents: installment.amountInCents,
    })
    .from(installment)
    .where(
      and(
        eq(installment.id, installmentId),
        eq(installment.paymentAgreementId, agreement.id)
      )
    )
    .for("update");
  return installments.at(0) ?? null;
};

/**
 * Starts a payment for an obligation or an installment, or gives the open payment again.
 * Before the decision, each pending payment of the target is reconciled with Wompi outside the lock,
 * so a lost webhook cannot let the citizen pay two times. The obligation row lock then makes
 * parallel checkouts wait, and the second one sees the payment that the first one made.
 * Lock order: obligation, agreement, installment. The payment rows are only read here.
 */
export const createCheckout = async (
  input: CreateCheckoutInput,
  deps: CreateCheckoutDeps
): Promise<CheckoutOutcome> => {
  // The join on citizen.user_id limits the citizen to their own obligations, also for the Wompi lookups.
  const earlier = await deps.database
    .select({ paymentId: payment.id })
    .from(obligation)
    .innerJoin(citizen, eq(citizen.id, obligation.citizenId))
    .leftJoin(payment, and(targetFilter(input), eq(payment.status, "pending")))
    .where(
      and(
        eq(obligation.id, input.obligationId),
        eq(citizen.userId, input.userId)
      )
    );
  if (earlier.length === 0) {
    return refuse({ reason: "obligation_not_found" });
  }
  for (const row of earlier) {
    if (row.paymentId === null) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- One Wompi lookup at a time.
    const result = await deps.reconcile(row.paymentId, input.actorId);
    if (result.kind === "unavailable") {
      return refuse({ reason: "earlier_payment_unavailable" });
    }
  }

  return await runAsActor(deps.database, input.actorId, async (tx) => {
    const owned = await tx
      .select({
        citizenId: obligation.citizenId,
        status: obligation.status,
        amountInCents: obligation.amountInCents,
        discountInCents: obligation.discountInCents,
      })
      .from(obligation)
      .innerJoin(citizen, eq(citizen.id, obligation.citizenId))
      .where(
        and(
          eq(obligation.id, input.obligationId),
          eq(citizen.userId, input.userId)
        )
      )
      .for("update", { of: obligation });
    const target = owned.at(0);
    if (!target) {
      return refuse({ reason: "obligation_not_found" });
    }

    let selectedInstallment = null;
    if (input.installmentId !== null) {
      selectedInstallment = await lockInstallment(
        tx,
        input.obligationId,
        input.installmentId
      );
      if (!selectedInstallment) {
        return refuse({ reason: "installment_not_found" });
      }
    }

    const amountDue = resolveAmountDue(target, selectedInstallment);
    if (!amountDue.ok) {
      return refuse({ reason: amountDue.reason });
    }

    const open = await tx
      .select({
        id: payment.id,
        reference: payment.reference,
        amountInCents: payment.amountInCents,
        createdAt: payment.createdAt,
      })
      .from(payment)
      .where(and(targetFilter(input), eq(payment.status, "pending")))
      .orderBy(desc(payment.id));
    // A pending attempt is a Wompi transaction in progress, also on a payment that is not pending any more.
    const inProgress = await tx
      .select({ id: paymentAttempt.id })
      .from(paymentAttempt)
      .innerJoin(payment, eq(payment.id, paymentAttempt.paymentId))
      .where(and(targetFilter(input), eq(paymentAttempt.status, "pending")))
      .limit(1);

    const decision = decideCheckout({
      open,
      hasPendingTransaction: inProgress.length > 0,
      amountInCents: amountDue.amountInCents,
      now: new Date(),
    });
    switch (decision.kind) {
      case "in_progress": {
        return refuse({ reason: "payment_in_progress" });
      }
      case "wait": {
        return refuse({ reason: "other_amount_open", until: decision.until });
      }
      case "reuse": {
        return { ok: true, payment: decision.payment };
      }
      case "create": {
        const [row] = await tx
          .insert(payment)
          .values({
            citizenId: target.citizenId,
            obligationId: input.obligationId,
            installmentId: input.installmentId,
            amountInCents: amountDue.amountInCents,
            reference: `tp_${crypto.randomUUID()}`,
          })
          .returning({
            id: payment.id,
            reference: payment.reference,
            amountInCents: payment.amountInCents,
            createdAt: payment.createdAt,
          });
        return { ok: true, payment: row };
      }
      default: {
        return decision satisfies never;
      }
    }
  });
};
