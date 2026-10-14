import "@tanstack/react-start/server-only";
import type {
  Result,
  Transaction as WompiTransaction,
} from "@pulgueta/wompi/schemas";
import { verifyWebhookEvent } from "@pulgueta/wompi/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { serverEnv } from "@/env/server";
import { db } from "@/server/db/client";
import type { Database, Transaction } from "@/server/db/client";
import { obligation } from "@/server/db/schema/obligations";
import {
  installment,
  payment,
  paymentAgreement,
  paymentAttempt,
} from "@/server/db/schema/payments";
import { claimEvent, markEventProcessed } from "@/server/webhook-inbox";
import { getWompi } from "@/server/wompi";

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

/** Stops the transaction when a conditional update finds no row. Nothing commits, and Wompi sends the event again. */
const expectOneRow = (rows: unknown[]) => {
  if (rows.length !== 1) {
    throw new Error("The payment changed during the update. Try again.");
  }
};

/**
 * Applies a transaction that we got from the Wompi API. Returns false when staff must examine the event:
 * it does not match a payment of ours, it conflicts with a final attempt, or the attempt is flagged for review.
 * The webhook and the reconciliation (`reconcile.ts`) use this one path, so a transaction has the same effect from both.
 */
export const applyTransactionUpdate = async (
  tx: Transaction,
  transaction: TransactionSnapshot
) => {
  // Lock order: payment, obligation, agreement, installment, attempt. The checkout uses the same order.
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

  const attempts = await tx
    .select({
      paymentId: paymentAttempt.paymentId,
      status: paymentAttempt.status,
      reviewReason: paymentAttempt.reviewReason,
    })
    .from(paymentAttempt)
    .where(eq(paymentAttempt.providerTransactionId, transaction.id))
    .for("update");
  const attempt = attempts.at(0) ?? null;

  const update = resolveTransactionUpdate(
    {
      ...current,
      obligationStatus: target.status,
      installment: installmentState,
    },
    attempt,
    transaction
  );
  if (update.kind === "rejected" || update.kind === "needs_review") {
    return false;
  }
  if (update.kind === "unchanged") {
    return true;
  }

  const now = new Date();
  const finalizedAt = update.attempt.status === "pending" ? null : now;
  if (attempt) {
    // Conditional: only a pending attempt changes.
    expectOneRow(
      await tx
        .update(paymentAttempt)
        .set({
          status: update.attempt.status,
          reviewReason: update.attempt.reviewReason,
          paymentMethodType: transaction.payment_method_type ?? null,
          finalizedAt,
        })
        .where(
          and(
            eq(paymentAttempt.providerTransactionId, transaction.id),
            eq(paymentAttempt.status, "pending")
          )
        )
        .returning({ id: paymentAttempt.id })
    );
  } else {
    // The unique transaction id stops a second row for the same transaction.
    await tx.insert(paymentAttempt).values({
      paymentId: current.id,
      providerTransactionId: transaction.id,
      status: update.attempt.status,
      amountInCents: current.amountInCents,
      currency: current.currency,
      paymentMethodType: transaction.payment_method_type ?? null,
      reviewReason: update.attempt.reviewReason,
      finalizedAt,
    });
  }

  if (update.payment) {
    // Conditional: the payment changes only from the status that the decision used.
    expectOneRow(
      await tx
        .update(payment)
        .set({ ...update.payment, finalizedAt: now })
        .where(
          and(eq(payment.id, current.id), eq(payment.status, current.status))
        )
        .returning({ id: payment.id })
    );
  }

  // The attempt waits for staff. For an approval, staff decide about a refund.
  if (update.attempt.reviewReason !== null) {
    return false;
  }

  const { effects } = update;
  if (effects.installmentPaid && current.installmentId !== null) {
    await tx
      .update(installment)
      .set({ status: "paid" })
      .where(eq(installment.id, current.installmentId));

    if (effects.agreementCompleted && installmentState) {
      await tx
        .update(paymentAgreement)
        .set({ status: "completed" })
        .where(eq(paymentAgreement.id, installmentState.agreementId));
    }
  }

  if (effects.obligationPaid) {
    await tx
      .update(obligation)
      .set({ status: "paid" })
      .where(eq(obligation.id, current.obligationId));
  }

  return true;
};

/**
 * The only event that we use. It checks only the fields that we read: the event name and the transaction id.
 * The SDK guard also requires fields that the signature does not cover (for example `reference`),
 * and we read these fields from the Wompi API.
 */
const transactionUpdatedEvent = z.object({
  event: z.literal("transaction.updated"),
  data: z.object({ transaction: z.object({ id: z.string() }) }),
});

/** Names the Wompi merchant account. The public key includes the environment (`pub_test_` or `pub_prod_`). */
export const paymentIntegration = (publicKey: string) => `wompi:${publicKey}`;

export interface PaymentWebhookDeps {
  database: Database;
  eventsKey: string;
  /** The account that signs the events (see `paymentIntegration`). */
  integration: string;
  /** Gets one transaction from the Wompi API. */
  getTransaction: (id: string) => Promise<Result<WompiTransaction>>;
}

/**
 * Handles a Wompi payments event and returns the HTTP status for the response.
 * The event signature covers only some fields, so we use only the signed transaction id.
 * We get the transaction from the Wompi API with that id and use its reference, status, and amount.
 * The event row and its effects commit in one transaction. If the API or the processing fails,
 * nothing commits, we answer 5xx, and Wompi sends the event again.
 * The audit actor is null: the gateway, not a user, makes these changes.
 */
export const processPaymentWebhook = async (
  rawBody: string,
  deps: PaymentWebhookDeps
) => {
  const [error, event] = await verifyWebhookEvent(rawBody, {
    eventsKey: deps.eventsKey,
  });
  if (error) {
    return 401;
  }

  // The signature does not cover the event name. Thus we do not write an inbox row for an event that we do not use:
  // a changed copy with the same checksum must not make the real event a duplicate.
  const supported = transactionUpdatedEvent.safeParse(event);
  if (!supported.success) {
    return 200;
  }
  if (!event.signature.properties.includes("transaction.id")) {
    return 401;
  }
  const transactionId = supported.data.data.transaction.id;

  const [fetchError, transaction] = await deps.getTransaction(transactionId);
  if (fetchError || transaction.id !== transactionId) {
    return 502;
  }

  const inboxEvent = {
    integration: deps.integration,
    eventType: event.event,
    checksum: event.signature.checksum,
    payload: event,
  };
  await deps.database.transaction(async (tx) => {
    const eventId = await claimEvent(tx, inboxEvent);
    // Null: we already processed this event.
    if (eventId === null) {
      return;
    }
    // An event that needs review keeps processed_at null, so that staff can find it.
    if (await applyTransactionUpdate(tx, transaction)) {
      await markEventProcessed(tx, eventId);
    }
  });

  return 200;
};

export const handlePaymentWebhook = async (rawBody: string) =>
  await processPaymentWebhook(rawBody, {
    database: db,
    eventsKey: serverEnv.WOMPI_EVENTS_KEY,
    integration: paymentIntegration(serverEnv.WOMPI_PUBLIC_KEY),
    getTransaction: async (id) =>
      await getWompi().transactions.getTransaction(id),
  });
