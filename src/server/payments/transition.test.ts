import {
  computeEventChecksum,
  isTransactionUpdatedEvent,
  verifyWebhookEvent,
} from "@pulgueta/wompi/server";
import { describe, expect, it } from "vitest";

import { resolveTransactionUpdate } from "./transition";
import type { PaymentSnapshot, TransactionSnapshot } from "./transition";

const payment: PaymentSnapshot = {
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

const noEffects = {
  obligationPaid: false,
  installmentPaid: false,
  agreementCompleted: false,
};

describe(resolveTransactionUpdate, () => {
  it("approves the payment and marks the obligation paid", () => {
    expect(resolveTransactionUpdate(payment, transaction)).toStrictEqual({
      kind: "applied",
      status: "approved",
      providerTransactionId: transaction.id,
      paymentMethodType: "CARD",
      effects: { ...noEffects, obligationPaid: true },
    });
  });

  it.each([
    ["DECLINED", "declined"],
    ["VOIDED", "voided"],
    ["ERROR", "error"],
  ] as const)(
    "records %s without effects on the obligation",
    (wompiStatus, status) => {
      expect(
        resolveTransactionUpdate(payment, {
          ...transaction,
          status: wompiStatus,
        })
      ).toMatchObject({ kind: "applied", status, effects: noEffects });
    }
  );

  it("marks only the installment paid when other installments are unpaid", () => {
    expect(
      resolveTransactionUpdate(installmentPayment, transaction)
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

  it("does nothing while the transaction is pending", () => {
    expect(
      resolveTransactionUpdate(payment, { ...transaction, status: "PENDING" })
    ).toStrictEqual({ kind: "unchanged" });
  });

  it("does nothing on an exact repeat of the final event", () => {
    expect(
      resolveTransactionUpdate(
        {
          ...payment,
          status: "approved",
          providerTransactionId: transaction.id,
        },
        transaction
      )
    ).toStrictEqual({ kind: "unchanged" });
  });

  it("does nothing on a late pending event for a final payment", () => {
    expect(
      resolveTransactionUpdate(
        {
          ...payment,
          status: "approved",
          providerTransactionId: transaction.id,
        },
        { ...transaction, status: "PENDING" }
      )
    ).toStrictEqual({ kind: "unchanged" });
  });

  it("asks for review on APPROVED after DECLINED", () => {
    expect(
      resolveTransactionUpdate(
        {
          ...payment,
          status: "declined",
          providerTransactionId: "1234-1610641025-00001",
        },
        transaction
      )
    ).toStrictEqual({ kind: "needs_review", reason: "final_status_conflict" });
  });

  it("asks for review on VOIDED after APPROVED", () => {
    expect(
      resolveTransactionUpdate(
        {
          ...payment,
          status: "approved",
          providerTransactionId: transaction.id,
        },
        { ...transaction, status: "VOIDED" }
      )
    ).toStrictEqual({ kind: "needs_review", reason: "final_status_conflict" });
  });

  it.each(["void", "paid", "in_agreement"] as const)(
    "records the approval but asks for review when the obligation is %s",
    (obligationStatus) => {
      expect(
        resolveTransactionUpdate({ ...payment, obligationStatus }, transaction)
      ).toMatchObject({
        kind: "applied",
        status: "approved",
        effects: "needs_review",
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
    "records an installment approval but asks for review when %s",
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
          transaction
        )
      ).toMatchObject({
        kind: "applied",
        status: "approved",
        effects: "needs_review",
      });
    }
  );

  it("records a decline for a void obligation without review", () => {
    expect(
      resolveTransactionUpdate(
        { ...payment, obligationStatus: "void" },
        { ...transaction, status: "DECLINED" }
      )
    ).toMatchObject({
      kind: "applied",
      status: "declined",
      effects: noEffects,
    });
  });

  it("rejects a reference mismatch", () => {
    expect(
      resolveTransactionUpdate(payment, { ...transaction, reference: "other" })
    ).toStrictEqual({ kind: "rejected", reason: "reference_mismatch" });
  });

  it("rejects an amount mismatch", () => {
    expect(
      resolveTransactionUpdate(payment, {
        ...transaction,
        amount_in_cents: 100,
      })
    ).toStrictEqual({ kind: "rejected", reason: "amount_mismatch" });
  });

  it("rejects a transaction without an amount", () => {
    const { amount_in_cents: _amount, ...withoutAmount } = transaction;
    expect(resolveTransactionUpdate(payment, withoutAmount)).toStrictEqual({
      kind: "rejected",
      reason: "amount_mismatch",
    });
  });

  it("rejects a currency mismatch", () => {
    expect(
      resolveTransactionUpdate({ ...payment, currency: "USD" }, transaction)
    ).toStrictEqual({ kind: "rejected", reason: "currency_mismatch" });
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

  it("verifies the event and approves the payment", async () => {
    const [error, event] = await verifyWebhookEvent(
      await signedBody("APPROVED"),
      { eventsKey }
    );

    expect(error).toBeNull();
    expect(event !== null && isTransactionUpdatedEvent(event)).toBeTruthy();
    if (event === null || !isTransactionUpdatedEvent(event)) {
      return;
    }
    expect(
      resolveTransactionUpdate(payment, event.data.transaction)
    ).toMatchObject({ kind: "applied", status: "approved" });
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
