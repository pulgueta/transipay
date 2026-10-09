import {
  computeEventChecksum,
  isTransactionUpdatedEvent,
  verifyWebhookEvent,
} from "@pulgueta/wompi/server";
import { describe, expect, it } from "vitest";

import { resolveTransactionUpdate } from "./transition";
import type {
  AttemptSnapshot,
  PaymentSnapshot,
  TransactionSnapshot,
} from "./transition";

const payment: PaymentSnapshot = {
  id: "0199c3a0-0000-7000-8000-000000000001",
  reference: "tp_0001",
  amountInCents: 4_000_000,
  currency: "COP",
  status: "pending",
  providerTransactionId: null,
  obligationStatus: "pending",
  installment: null,
};

const installmentPayment: PaymentSnapshot = {
  ...payment,
  obligationStatus: "in_agreement",
  installment: {
    status: "pending",
    agreementStatus: "active",
    otherUnpaidInstallments: 2,
  },
};

const transaction: TransactionSnapshot = {
  id: "1234-1610641025-49201",
  status: "APPROVED",
  reference: "tp_0001",
  amount_in_cents: 4_000_000,
  currency: "COP",
  payment_method_type: "CARD",
};

const attempt = (
  status: AttemptSnapshot["status"],
  reviewReason: AttemptSnapshot["reviewReason"] = null
): AttemptSnapshot => ({ paymentId: payment.id, status, reviewReason });

const noEffects = {
  obligationPaid: false,
  installmentPaid: false,
  agreementCompleted: false,
};

const approvedChange = {
  status: "approved",
  providerTransactionId: transaction.id,
  paymentMethodType: "CARD",
};

describe(resolveTransactionUpdate, () => {
  it("approves the payment and marks the obligation paid", () => {
    expect(resolveTransactionUpdate(payment, null, transaction)).toStrictEqual({
      kind: "applied",
      attempt: { status: "approved", reviewReason: null },
      payment: approvedChange,
      effects: { ...noEffects, obligationPaid: true },
    });
  });

  it("approves the payment when a pending attempt becomes approved", () => {
    expect(
      resolveTransactionUpdate(payment, attempt("pending"), transaction)
    ).toMatchObject({
      kind: "applied",
      attempt: { status: "approved", reviewReason: null },
      payment: approvedChange,
    });
  });

  it.each([
    ["DECLINED", "declined"],
    ["VOIDED", "voided"],
    ["ERROR", "error"],
  ] as const)(
    "records %s on the attempt and the payment without effects",
    (wompiStatus, status) => {
      expect(
        resolveTransactionUpdate(payment, null, {
          ...transaction,
          status: wompiStatus,
        })
      ).toStrictEqual({
        kind: "applied",
        attempt: { status, reviewReason: null },
        payment: {
          status,
          providerTransactionId: transaction.id,
          paymentMethodType: "CARD",
        },
        effects: noEffects,
      });
    }
  );

  it("records a new pending attempt without a change to the payment", () => {
    expect(
      resolveTransactionUpdate(payment, null, {
        ...transaction,
        status: "PENDING",
      })
    ).toStrictEqual({
      kind: "applied",
      attempt: { status: "pending", reviewReason: null },
      payment: null,
      effects: noEffects,
    });
  });

  it("does nothing on a pending event for a pending attempt", () => {
    expect(
      resolveTransactionUpdate(payment, attempt("pending"), {
        ...transaction,
        status: "PENDING",
      })
    ).toStrictEqual({ kind: "unchanged" });
  });

  it("marks only the installment paid when other installments are unpaid", () => {
    expect(
      resolveTransactionUpdate(installmentPayment, null, transaction)
    ).toMatchObject({
      kind: "applied",
      effects: { ...noEffects, installmentPaid: true },
    });
  });

  it("completes the agreement and pays the obligation on the last installment", () => {
    expect(
      resolveTransactionUpdate(
        {
          ...installmentPayment,
          installment: {
            status: "overdue",
            agreementStatus: "active",
            otherUnpaidInstallments: 0,
          },
        },
        null,
        transaction
      )
    ).toMatchObject({
      kind: "applied",
      effects: {
        obligationPaid: true,
        installmentPaid: true,
        agreementCompleted: true,
      },
    });
  });

  describe("retry after a failed attempt (same reference, new transaction)", () => {
    it.each(["declined", "error", "voided"] as const)(
      "approves a payment that is %s and pays the obligation",
      (status) => {
        expect(
          resolveTransactionUpdate(
            {
              ...payment,
              status,
              providerTransactionId: "1234-1610641025-00001",
            },
            null,
            transaction
          )
        ).toStrictEqual({
          kind: "applied",
          attempt: { status: "approved", reviewReason: null },
          payment: approvedChange,
          effects: { ...noEffects, obligationPaid: true },
        });
      }
    );

    it("records a second decline on the payment", () => {
      expect(
        resolveTransactionUpdate(
          {
            ...payment,
            status: "declined",
            providerTransactionId: "1234-1610641025-00001",
          },
          null,
          { ...transaction, status: "ERROR" }
        )
      ).toMatchObject({
        kind: "applied",
        attempt: { status: "error", reviewReason: null },
        payment: { status: "error", providerTransactionId: transaction.id },
        effects: noEffects,
      });
    });
  });

  describe("approved payment", () => {
    const approvedPayment: PaymentSnapshot = {
      ...payment,
      status: "approved",
      providerTransactionId: "1234-1610641025-00001",
      obligationStatus: "paid",
    };

    it("flags a second approval for review and does not pay again", () => {
      expect(
        resolveTransactionUpdate(approvedPayment, null, transaction)
      ).toStrictEqual({
        kind: "applied",
        attempt: { status: "approved", reviewReason: "second_approval" },
        payment: null,
        effects: noEffects,
      });
    });

    it("records a late decline of another attempt and keeps the approval", () => {
      expect(
        resolveTransactionUpdate(approvedPayment, null, {
          ...transaction,
          status: "DECLINED",
        })
      ).toStrictEqual({
        kind: "applied",
        attempt: { status: "declined", reviewReason: null },
        payment: null,
        effects: noEffects,
      });
    });

    it("records the approving transaction when its attempt row is missing", () => {
      expect(
        resolveTransactionUpdate(
          { ...approvedPayment, providerTransactionId: transaction.id },
          null,
          transaction
        )
      ).toStrictEqual({
        kind: "applied",
        attempt: { status: "approved", reviewReason: null },
        payment: null,
        effects: noEffects,
      });
    });
  });

  describe("repeat of a final attempt", () => {
    it("does nothing on an exact repeat", () => {
      expect(
        resolveTransactionUpdate(
          {
            ...payment,
            status: "approved",
            providerTransactionId: transaction.id,
          },
          attempt("approved"),
          transaction
        )
      ).toStrictEqual({ kind: "unchanged" });
    });

    it("does nothing on a late pending event", () => {
      expect(
        resolveTransactionUpdate(payment, attempt("declined"), {
          ...transaction,
          status: "PENDING",
        })
      ).toStrictEqual({ kind: "unchanged" });
    });

    it("keeps an attempt that is flagged for review in review", () => {
      expect(
        resolveTransactionUpdate(
          { ...payment, status: "approved", providerTransactionId: "other" },
          attempt("approved", "second_approval"),
          transaction
        )
      ).toStrictEqual({ kind: "needs_review", reason: "second_approval" });
    });

    it("asks for review on VOIDED after APPROVED", () => {
      expect(
        resolveTransactionUpdate(
          {
            ...payment,
            status: "approved",
            providerTransactionId: transaction.id,
          },
          attempt("approved"),
          { ...transaction, status: "VOIDED" }
        )
      ).toStrictEqual({
        kind: "needs_review",
        reason: "final_status_conflict",
      });
    });
  });

  it.each(["void", "paid", "in_agreement"] as const)(
    "records the approval but flags it for review when the obligation is %s",
    (obligationStatus) => {
      expect(
        resolveTransactionUpdate(
          { ...payment, obligationStatus },
          null,
          transaction
        )
      ).toStrictEqual({
        kind: "applied",
        attempt: { status: "approved", reviewReason: "target_not_payable" },
        payment: approvedChange,
        effects: noEffects,
      });
    }
  );

  it.each([
    [
      "the agreement is cancelled",
      { obligationStatus: "in_agreement", agreementStatus: "cancelled" },
    ],
    [
      "the installment is paid",
      { obligationStatus: "in_agreement", installmentStatus: "paid" },
    ],
    [
      "the obligation is void",
      { obligationStatus: "void", agreementStatus: "active" },
    ],
  ] as const)(
    "records an installment approval but flags it for review when %s",
    (_case, state) => {
      expect(
        resolveTransactionUpdate(
          {
            ...installmentPayment,
            obligationStatus: state.obligationStatus,
            installment: {
              status:
                "installmentStatus" in state
                  ? state.installmentStatus
                  : "pending",
              agreementStatus:
                "agreementStatus" in state ? state.agreementStatus : "active",
              otherUnpaidInstallments: 0,
            },
          },
          null,
          transaction
        )
      ).toMatchObject({
        kind: "applied",
        attempt: { status: "approved", reviewReason: "target_not_payable" },
        effects: noEffects,
      });
    }
  );

  it("records a decline for a void obligation without review", () => {
    expect(
      resolveTransactionUpdate({ ...payment, obligationStatus: "void" }, null, {
        ...transaction,
        status: "DECLINED",
      })
    ).toMatchObject({
      kind: "applied",
      attempt: { status: "declined", reviewReason: null },
      effects: noEffects,
    });
  });

  it("rejects a reference mismatch", () => {
    expect(
      resolveTransactionUpdate(payment, null, {
        ...transaction,
        reference: "other",
      })
    ).toStrictEqual({ kind: "rejected", reason: "reference_mismatch" });
  });

  it("rejects an amount mismatch", () => {
    expect(
      resolveTransactionUpdate(payment, null, {
        ...transaction,
        amount_in_cents: 100,
      })
    ).toStrictEqual({ kind: "rejected", reason: "amount_mismatch" });
  });

  it("rejects a transaction without an amount", () => {
    const { amount_in_cents: _amount, ...withoutAmount } = transaction;
    expect(
      resolveTransactionUpdate(payment, null, withoutAmount)
    ).toStrictEqual({
      kind: "rejected",
      reason: "amount_mismatch",
    });
  });

  it("rejects a currency mismatch", () => {
    expect(
      resolveTransactionUpdate(
        { ...payment, currency: "USD" },
        null,
        transaction
      )
    ).toStrictEqual({ kind: "rejected", reason: "currency_mismatch" });
  });

  it("rejects a transaction that is an attempt of another payment", () => {
    expect(
      resolveTransactionUpdate(
        payment,
        { ...attempt("pending"), paymentId: "another-payment" },
        transaction
      )
    ).toStrictEqual({ kind: "rejected", reason: "attempt_of_other_payment" });
  });
});

describe("signed transaction.updated event", () => {
  const eventsKey = "test_events_key";

  const signedBody = async (status: TransactionSnapshot["status"]) => {
    const event = {
      event: "transaction.updated",
      data: { transaction: { ...transaction, status } },
      environment: "test",
      signature: {
        properties: [
          "transaction.id",
          "transaction.status",
          "transaction.amount_in_cents",
        ],
        checksum: "",
      },
      timestamp: 1_760_000_000,
      sent_at: "2026-10-08T12:00:00.000Z",
    };
    const checksum = await computeEventChecksum(event, eventsKey);
    return JSON.stringify({
      ...event,
      signature: { ...event.signature, checksum },
    });
  };

  it("verifies the event and gives a typed transaction", async () => {
    const [error, event] = await verifyWebhookEvent(
      await signedBody("APPROVED"),
      { eventsKey }
    );

    expect(error).toBeNull();
    expect(event !== null && isTransactionUpdatedEvent(event)).toBeTruthy();
  });

  it("rejects an event that changed after it was signed", async () => {
    const declined = await signedBody("DECLINED");
    const tampered = declined.replace('"DECLINED"', '"APPROVED"');

    const [error, event] = await verifyWebhookEvent(tampered, { eventsKey });

    expect(error).not.toBeNull();
    expect(event).toBeNull();
  });

  it("rejects an event signed with another key", async () => {
    const [error] = await verifyWebhookEvent(await signedBody("APPROVED"), {
      eventsKey: "another_key",
    });

    expect(error).not.toBeNull();
  });
});
