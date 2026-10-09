import type { Transaction, TransactionStatus } from "@pulgueta/wompi/schemas";

import type { ObligationStatus } from "@/server/db/schema/obligations";
import type {
  AgreementStatus,
  InstallmentStatus,
  PaymentStatus,
} from "@/server/db/schema/payments";

/** The payment and the current state of what it pays. The caller locks these rows. */
export interface PaymentSnapshot {
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

export type TransactionUpdate =
  | {
      kind: "rejected";
      reason: "reference_mismatch" | "amount_mismatch" | "currency_mismatch";
    }
  | { kind: "unchanged" }
  // The payment is final and the event reports another result. Staff must examine it.
  | { kind: "needs_review"; reason: "final_status_conflict" }
  | {
      kind: "applied";
      status: PaymentStatus;
      providerTransactionId: string;
      paymentMethodType: string | null;
      // "needs_review": the money is collected, but the target is not payable now (possible refund).
      effects: PaymentEffects | "needs_review";
    };

const STATUS_BY_WOMPI_STATUS: Record<TransactionStatus, PaymentStatus> = {
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

/**
 * Decides what a Wompi `transaction.updated` event does to our payment.
 * The payment changes only once, from `pending` to a final status. An exact repeat has no effect.
 * A pending event never changes the payment, because events can arrive out of order.
 */
export const resolveTransactionUpdate = (
  payment: PaymentSnapshot,
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

  const status = STATUS_BY_WOMPI_STATUS[transaction.status];
  if (status === "pending") {
    return { kind: "unchanged" };
  }
  if (payment.status !== "pending") {
    const isRepeat =
      payment.status === status &&
      payment.providerTransactionId === transaction.id;
    return isRepeat
      ? { kind: "unchanged" }
      : { kind: "needs_review", reason: "final_status_conflict" };
  }

  return {
    kind: "applied",
    status,
    providerTransactionId: transaction.id,
    paymentMethodType: transaction.payment_method_type ?? null,
    effects: status === "approved" ? effectsOf(payment) : NO_EFFECTS,
  };
};
