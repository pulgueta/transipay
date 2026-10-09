import type { ObligationStatus } from "@/server/db/schema/obligations";
import type { InstallmentStatus } from "@/server/db/schema/payments";

export interface PayableObligation {
  status: ObligationStatus;
  amountInCents: number;
  discountInCents: number;
}

export interface PayableInstallment {
  status: InstallmentStatus;
  amountInCents: number;
}

export type AmountDueError =
  | "obligation_not_payable"
  | "installment_required"
  | "installment_not_allowed"
  | "installment_not_payable"
  | "nothing_due";

export type AmountDue =
  | { ok: true; amountInCents: number }
  | { ok: false; reason: AmountDueError };

const fail = (reason: AmountDueError): AmountDue => ({ ok: false, reason });

const due = (amountInCents: number): AmountDue =>
  amountInCents > 0 ? { ok: true, amountInCents } : fail("nothing_due");

/**
 * Finds the amount that one payment must collect.
 * An obligation without an agreement is paid in full (amount minus discount).
 * An obligation in an agreement is paid one installment at a time.
 */
export const resolveAmountDue = (
  obligation: PayableObligation,
  installment: PayableInstallment | null
): AmountDue => {
  if (obligation.status === "pending") {
    return installment
      ? fail("installment_not_allowed")
      : due(obligation.amountInCents - obligation.discountInCents);
  }

  if (obligation.status === "in_agreement") {
    if (!installment) {
      return fail("installment_required");
    }
    return installment.status === "paid"
      ? fail("installment_not_payable")
      : due(installment.amountInCents);
  }

  return fail("obligation_not_payable");
};
