import type { Transaction } from "@pulgueta/wompi/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { schema } from "@/server/db/client";

import { paymentIntegration, processPaymentWebhook } from "./webhook";
import type { PaymentWebhookDeps } from "./webhook";
import {
  TEST_EVENTS_KEY,
  TEST_INTEGRATION,
  editEventBody,
  signedTransactionEvent,
} from "./webhook-testing";

/** These paths must answer before they use the database. This pool has no server, so a query fails. */
const noDatabase = drizzle(
  new Pool({ connectionString: "postgres://nobody@127.0.0.1:1/none" }),
  { schema, casing: "snake_case" }
);

const transaction: Transaction = {
  id: "1234-1610641025-49201",
  status: "APPROVED",
  reference: "tp_0001",
  amount_in_cents: 4_000_000,
  currency: "COP",
};

const deps = (
  getTransaction: PaymentWebhookDeps["getTransaction"]
): PaymentWebhookDeps => ({
  database: noDatabase,
  eventsKey: TEST_EVENTS_KEY,
  integration: TEST_INTEGRATION,
  getTransaction,
});

describe(processPaymentWebhook, () => {
  it("returns 401 for a bad signature and does not call Wompi", async () => {
    const getTransaction = vi.fn<PaymentWebhookDeps["getTransaction"]>();
    const { body } = await signedTransactionEvent(transaction);
    const tampered = body.replace('"APPROVED"', '"DECLINED"');

    await expect(
      processPaymentWebhook(tampered, deps(getTransaction))
    ).resolves.toBe(401);
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("returns 401 when the signature does not cover the transaction id", async () => {
    const getTransaction = vi.fn<PaymentWebhookDeps["getTransaction"]>();
    const { body } = await signedTransactionEvent(transaction, {
      properties: ["transaction.status", "transaction.amount_in_cents"],
    });

    await expect(
      processPaymentWebhook(body, deps(getTransaction))
    ).resolves.toBe(401);
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("returns 200 for an event with a changed unsigned name, and does not write the inbox", async () => {
    const getTransaction = vi.fn<PaymentWebhookDeps["getTransaction"]>();
    const { body } = await signedTransactionEvent(transaction);
    const tampered = editEventBody(body, (event) => {
      event.event = "transaction.unknown";
    });

    // This pool has no server, so an inbox write fails.
    await expect(
      processPaymentWebhook(tampered, deps(getTransaction))
    ).resolves.toBe(200);
    expect(getTransaction).not.toHaveBeenCalled();
  });

  it("returns 502 when Wompi does not give the transaction, so Wompi sends the event again", async () => {
    const getTransaction = vi
      .fn<PaymentWebhookDeps["getTransaction"]>()
      .mockResolvedValue([new Error("Service unavailable"), null]);
    const { body } = await signedTransactionEvent(transaction);

    await expect(
      processPaymentWebhook(body, deps(getTransaction))
    ).resolves.toBe(502);
    expect(getTransaction).toHaveBeenCalledWith(transaction.id);
  });

  it("returns 502 when Wompi gives another transaction", async () => {
    const { body } = await signedTransactionEvent(transaction);

    await expect(
      processPaymentWebhook(
        body,
        deps(
          vi
            .fn<PaymentWebhookDeps["getTransaction"]>()
            .mockResolvedValue([null, { ...transaction, id: "another" }])
        )
      )
    ).resolves.toBe(502);
  });
});

describe(paymentIntegration, () => {
  it("names the provider and the merchant account of the public key", () => {
    expect(paymentIntegration("pub_prod_abc123")).toBe("wompi:pub_prod_abc123");
  });
});
