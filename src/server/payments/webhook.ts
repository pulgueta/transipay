import "@tanstack/react-start/server-only";
import {
  isTransactionUpdatedEvent,
  verifyWebhookEvent,
} from "@pulgueta/wompi/server";
import { and, eq, ne } from "drizzle-orm";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import type { Transaction } from "@/server/db/client";
import { obligation } from "@/server/db/schema/obligations";
import {
  installment,
  payment,
  paymentAgreement,
  paymentEvent,
} from "@/server/db/schema/payments";

import { resolveTransactionUpdate } from "./transition";
import type { TransactionSnapshot } from "./transition";

/** Locks the agreement, then the installment, and reads their state. Returns null when the installment is missing. */
const lockInstallment = async (tx: Transaction, installmentId: string) => {
  const rows = await tx
    .select({ agreementId: installment.paymentAgreementId })
    .from(installment)
    .where(eq(installment.id, installmentId));
  const agreementId = rows.at(0)?.agreementId;
  if (agreementId === undefined) {
    return null;
  }

  // The agreement lock also makes two installments that are paid at the same time see each other.
  const agreements = await tx
    .select({ status: paymentAgreement.status })
    .from(paymentAgreement)
    .where(eq(paymentAgreement.id, agreementId))
    .for("update");
  const locked = await tx
    .select({ status: installment.status })
    .from(installment)
    .where(eq(installment.id, installmentId))
    .for("update");
  const agreement = agreements.at(0);
  const target = locked.at(0);
  if (!agreement || !target) {
    return null;
  }

  const otherUnpaidInstallments = await tx.$count(
    installment,
    and(
      eq(installment.paymentAgreementId, agreementId),
      ne(installment.id, installmentId),
      ne(installment.status, "paid")
    )
  );
  return {
    agreementId,
    status: target.status,
    agreementStatus: agreement.status,
    otherUnpaidInstallments,
  };
};

/**
 * Applies a verified transaction update. Returns false when staff must examine the event:
 * it does not match a payment of ours, it conflicts with a final payment, or it collected money for a target that is not payable.
 */
const applyTransactionUpdate = async (
  tx: Transaction,
  transaction: TransactionSnapshot
) => {
  // Lock order: payment, obligation, agreement, installment. The checkout uses the same order.
  const rows = await tx
    .select({
      id: payment.id,
      obligationId: payment.obligationId,
      installmentId: payment.installmentId,
      reference: payment.reference,
      amountInCents: payment.amountInCents,
      currency: payment.currency,
      status: payment.status,
      providerTransactionId: payment.providerTransactionId,
    })
    .from(payment)
    .where(eq(payment.reference, transaction.reference))
    .for("update");
  const current = rows.at(0);
  if (!current) {
    return false;
  }

  const obligations = await tx
    .select({ status: obligation.status })
    .from(obligation)
    .where(eq(obligation.id, current.obligationId))
    .for("update");
  const target = obligations.at(0);
  if (!target) {
    return false;
  }

  let installmentState = null;
  if (current.installmentId !== null) {
    installmentState = await lockInstallment(tx, current.installmentId);
    if (!installmentState) {
      return false;
    }
  }

  const update = resolveTransactionUpdate(
    {
      ...current,
      obligationStatus: target.status,
      installment: installmentState,
    },
    transaction
  );
  if (update.kind === "rejected" || update.kind === "needs_review") {
    return false;
  }
  if (update.kind === "unchanged") {
    return true;
  }

  await tx
    .update(payment)
    .set({
      status: update.status,
      providerTransactionId: update.providerTransactionId,
      paymentMethodType: update.paymentMethodType,
      finalizedAt: new Date(),
    })
    .where(eq(payment.id, current.id));

  // The money is collected, but the obligation state does not change. Staff decide about a refund.
  if (update.effects === "needs_review") {
    return false;
  }

  if (update.effects.installmentPaid && current.installmentId !== null) {
    await tx
      .update(installment)
      .set({ status: "paid" })
      .where(eq(installment.id, current.installmentId));

    if (update.effects.agreementCompleted && installmentState) {
      await tx
        .update(paymentAgreement)
        .set({ status: "completed" })
        .where(eq(paymentAgreement.id, installmentState.agreementId));
    }
  }

  if (update.effects.obligationPaid) {
    await tx
      .update(obligation)
      .set({ status: "paid" })
      .where(eq(obligation.id, current.obligationId));
  }

  return true;
};

/**
 * Handles a Wompi payments event and returns the HTTP status for the response.
 * The event row and its effects commit in one transaction. If processing fails, nothing commits,
 * we answer 500, and Wompi sends the event again.
 * The audit actor is null: the gateway, not a user, makes these changes.
 */
export const handlePaymentWebhook = async (rawBody: string) => {
  const [error, event] = await verifyWebhookEvent(rawBody, {
    eventsKey: serverEnv.WOMPI_EVENTS_KEY,
  });
  if (error) {
    return 401;
  }

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(paymentEvent)
      .values({
        eventType: event.event,
        checksum: event.signature.checksum,
        payload: event,
      })
      .onConflictDoNothing({ target: paymentEvent.checksum })
      .returning({ id: paymentEvent.id });
    const recorded = inserted.at(0);

    // No row: we already have this event.
    if (!recorded || !isTransactionUpdatedEvent(event)) {
      return;
    }

    // An event that needs review keeps processed_at null, so that staff can find it.
    if (await applyTransactionUpdate(tx, event.data.transaction)) {
      await tx
        .update(paymentEvent)
        .set({ processedAt: new Date() })
        .where(eq(paymentEvent.id, recorded.id));
    }
  });

  return 200;
};
