import type { Transaction, TransactionStatus } from "@pulgueta/wompi/schemas";

import type { ObligationStatus } from "@/server/db/schema/obligations";
import type {
  AgreementStatus,
  InstallmentStatus,
  PaymentAttemptReviewReason,
  PaymentAttemptStatus,
  PaymentStatus,
} from "@/server/db/schema/payments";

/** The payment and the current state of what it pays. The caller locks these rows. */
export interface PaymentSnapshot {
  id: string;
  reference: string;
  amountInCents: number;
  currency: string;
  status: PaymentStatus;
  providerTransactionId: string | null;
  obligationStatus: ObligationStatus;
  /** Null when the payment is for the full obligation. */
  installment: {
    status: InstallmentStatus;
    agreementStatus: AgreementStatus;
    otherUnpaidInstallments: number;
  } | null;
}

/** The attempt row that has the transaction id of the event. The caller locks it. */
export interface AttemptSnapshot {
  paymentId: string;
  status: PaymentAttemptStatus;
  reviewReason: PaymentAttemptReviewReason | null;
}
export type TransactionSnapshot = Pick<
  Transaction,
  | "id"
  | "status"
  | "reference"
  | "amount_in_cents"
  | "currency"
  | "payment_method_type"
>;

export interface PaymentEffects {
  obligationPaid: boolean;
  installmentPaid: boolean;
  agreementCompleted: boolean;
}

export interface PaymentChange {
  status: PaymentStatus;
  providerTransactionId: string;
  paymentMethodType: string | null;
}

export type TransactionUpdate =
  | {
      kind: "rejected";
      reason:
        | "reference_mismatch"
        | "amount_mismatch"
        | "currency_mismatch"
        | "attempt_of_other_payment";
    }
  | { kind: "unchanged" }
  // The attempt is final and the event reports another result, or the attempt waits for review. Staff must examine it.
  | {
      kind: "needs_review";
      reason: "final_status_conflict" | PaymentAttemptReviewReason;
    }
  | {
      kind: "applied";
      // The caller inserts the attempt or moves it from 'pending'. A review reason keeps the event unprocessed.
      attempt: {
        status: PaymentAttemptStatus;
        reviewReason: PaymentAttemptReviewReason | null;
      };
      // Null when the payment does not change.
      payment: PaymentChange | null;
      effects: PaymentEffects;
    };

const STATUS_BY_WOMPI_STATUS: Record<TransactionStatus, PaymentAttemptStatus> =
  {
    PENDING: "pending",
    APPROVED: "approved",
    DECLINED: "declined",
    VOIDED: "voided",
    ERROR: "error",
  };

const NO_EFFECTS: PaymentEffects = {
  obligationPaid: false,
  installmentPaid: false,
  agreementCompleted: false,
};

const effectsOf = (
  payment: PaymentSnapshot
): PaymentEffects | "needs_review" => {
  const { installment } = payment;
  if (!installment) {
    return payment.obligationStatus === "pending"
      ? { ...NO_EFFECTS, obligationPaid: true }
      : "needs_review";
  }

  const isPayable =
    payment.obligationStatus === "in_agreement" &&
    installment.agreementStatus === "active" &&
    installment.status !== "paid";
  if (!isPayable) {
    return "needs_review";
  }

  const isLastInstallment = installment.otherUnpaidInstallments === 0;
  return {
    obligationPaid: isLastInstallment,
    installmentPaid: true,
    agreementCompleted: isLastInstallment,
  };
};

const applied = (
  attempt: Extract<TransactionUpdate, { kind: "applied" }>["attempt"],
  payment: PaymentChange | null,
  effects: PaymentEffects = NO_EFFECTS
): TransactionUpdate => ({ kind: "applied", attempt, payment, effects });

/**
 * Decides what a Wompi transaction does to our payment and to its attempt.
 * - An attempt changes one time, from 'pending' to a final status. A repeat has no effect.
 * - A pending transaction never changes the payment, because events can arrive out of order.
 * - An approved attempt approves a payment that is not approved (also after a decline: Wompi retries with the same reference).
 * - A second approved attempt for an approved payment goes to review. It never pays two times.
 */
export const resolveTransactionUpdate = (
  payment: PaymentSnapshot,
  attempt: AttemptSnapshot | null,
  transaction: TransactionSnapshot
): TransactionUpdate => {
  if (transaction.reference !== payment.reference) {
    return { kind: "rejected", reason: "reference_mismatch" };
  }
  if (transaction.amount_in_cents !== payment.amountInCents) {
    return { kind: "rejected", reason: "amount_mismatch" };
  }
  if (transaction.currency !== payment.currency) {
    return { kind: "rejected", reason: "currency_mismatch" };
  }
  if (attempt && attempt.paymentId !== payment.id) {
    return { kind: "rejected", reason: "attempt_of_other_payment" };
  }

  const status = STATUS_BY_WOMPI_STATUS[transaction.status];

  if (attempt && attempt.status !== "pending") {
    if (status !== attempt.status && status !== "pending") {
      return { kind: "needs_review", reason: "final_status_conflict" };
    }
    return attempt.reviewReason === null
      ? { kind: "unchanged" }
      : { kind: "needs_review", reason: attempt.reviewReason };
  }

  if (status === "pending") {
    return attempt
      ? { kind: "unchanged" }
      : applied({ status, reviewReason: null }, null);
  }

  const change: PaymentChange = {
    status,
    providerTransactionId: transaction.id,
    paymentMethodType: transaction.payment_method_type ?? null,
  };

  if (payment.status === "approved") {
    // The payment keeps its approval. Only a second approval can be a second collection.
    const isSecondApproval =
      status === "approved" && payment.providerTransactionId !== transaction.id;
    return applied(
      {
        status,
        reviewReason: isSecondApproval ? "second_approval" : null,
      },
      null
    );
  }

  if (status !== "approved") {
    return applied({ status, reviewReason: null }, change);
  }

  // The money is collected. If the target is not payable now, staff decide about a refund.
  const effects = effectsOf(payment);
  return effects === "needs_review"
    ? applied({ status, reviewReason: "target_not_payable" }, change)
    : applied({ status, reviewReason: null }, change, effects);
};
