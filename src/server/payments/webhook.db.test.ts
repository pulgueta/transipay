import { randomUUID } from "node:crypto";

import type { Result, Transaction } from "@pulgueta/wompi/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { processPaymentWebhook } from "./webhook";
import type { PaymentWebhookDeps } from "./webhook";
import {
  TEST_EVENTS_KEY,
  TEST_INTEGRATION,
  editEventBody,
  signedTransactionEvent,
} from "./webhook-testing";

const UNIQUE_VIOLATION = "23505";
const AMOUNT = 4_000_000;

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

/** The Wompi API in these tests. A transaction that is not in the map gives an error. */
const wompiApi = new Map<string, Transaction>();

const deps = (): PaymentWebhookDeps => ({
  database: appDatabase,
  eventsKey: TEST_EVENTS_KEY,
  integration: TEST_INTEGRATION,
  getTransaction: async (id) => {
    const found = wompiApi.get(id);
    return await Promise.resolve<Result<Transaction>>(
      found ? [null, found] : [new Error("Not found"), null]
    );
  },
});

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

const queryId = async (text: string, values: unknown[]) => {
  const result = await database.pool.query<{ id: string }>(text, values);
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The insert returned no row.");
  }
  return row.id;
};

const seedObligation = async () => {
  const entityId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ('transit_authority', 'Entity', $1, 'entity@example.com', '3000000000') returning id`,
    [unique()]
  );
  const citizenId = await queryId(
    `insert into citizen (document_type, document_number, first_name, last_name)
     values ('CC', $1, 'Ana', 'Rojas') returning id`,
    [unique().toUpperCase()]
  );
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents)
     values ($1, $2, 'fine', $3, $4) returning id`,
    [citizenId, entityId, unique(), AMOUNT]
  );
  return { citizenId, obligationId };
};

const seedPayment = async (reference = `tp_${unique()}`) => {
  const { citizenId, obligationId } = await seedObligation();
  const paymentId = await queryId(
    `insert into payment (citizen_id, obligation_id, amount_in_cents, reference)
     values ($1, $2, $3, $4) returning id`,
    [citizenId, obligationId, AMOUNT, reference]
  );
  return { paymentId, obligationId, reference };
};

/** Puts the transaction in the fake API and gives a signed event for it. */
const wompiTransaction = async (
  reference: string,
  status: Transaction["status"],
  options: { id?: string; timestamp?: number } = {}
) => {
  const transaction: Transaction = {
    id: options.id ?? `${unique()}-1610641025-49201`,
    status,
    reference,
    amount_in_cents: AMOUNT,
    currency: "COP",
    payment_method_type: "CARD",
  };
  wompiApi.set(transaction.id, transaction);
  // The event body has another reference and amount. Only the signed id is used.
  const event = await signedTransactionEvent(
    { id: transaction.id, status },
    { timestamp: options.timestamp }
  );
  return { transaction, ...event };
};

const paymentState = async (paymentId: string, obligationId: string) => {
  const payments = await database.pool.query<{
    status: string;
    provider_transaction_id: string | null;
  }>("select status, provider_transaction_id from payment where id = $1", [
    paymentId,
  ]);
  const obligations = await database.pool.query<{ status: string }>(
    "select status from obligation where id = $1",
    [obligationId]
  );
  const attempts = await database.pool.query<{
    provider_transaction_id: string;
    status: string;
    review_reason: string | null;
  }>(
    `select provider_transaction_id, status, review_reason from payment_attempt
     where payment_id = $1 order by id`,
    [paymentId]
  );
  // Each money effect on the obligation is one audit row.
  const paidUpdates = await database.pool.query<{ count: string }>(
    `select count(*) from audit_log where table_name = 'obligation'
       and record_id = $1 and action = 'update' and new_data ->> 'status' = 'paid'`,
    [obligationId]
  );
  return {
    payment: payments.rows.at(0),
    obligationStatus: obligations.rows.at(0)?.status,
    attempts: attempts.rows,
    paidUpdates: Number(paidUpdates.rows.at(0)?.count),
  };
};

const insertEvent = async (integration: string, checksum: string) =>
  await database.pool.query(
    `insert into payment_event (integration, event_type, checksum, payload)
     values ($1, 'transaction.updated', $2, '{}')`,
    [integration, checksum]
  );

const insertAttempt = async (paymentId: string, transactionId: string) =>
  await database.pool.query(
    `insert into payment_attempt (payment_id, provider_transaction_id, status, amount_in_cents, currency)
     values ($1, $2, 'pending', $3, 'COP')`,
    [paymentId, transactionId, AMOUNT]
  );

const eventProcessed = async (checksum: string) => {
  const result = await database.pool.query<{ processed: boolean }>(
    `select processed_at is not null as processed from payment_event
     where integration = $1 and checksum = $2`,
    [TEST_INTEGRATION, checksum]
  );
  return result.rows.map((row) => row.processed);
};

describe("payment webhook with payment attempts", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("finds the payment by the reference from the API, not from the event body", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const approved = await wompiTransaction(reference, "APPROVED");

    await expect(processPaymentWebhook(approved.body, deps())).resolves.toBe(
      200
    );

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: {
        status: "approved",
        provider_transaction_id: approved.transaction.id,
      },
      obligationStatus: "paid",
    });
    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([
      true,
    ]);
  });

  it("approves the payment on a retry after a decline and pays the obligation one time", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const declined = await wompiTransaction(reference, "DECLINED");
    const approved = await wompiTransaction(reference, "APPROVED");

    await processPaymentWebhook(declined.body, deps());
    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "declined" },
      obligationStatus: "pending",
    });

    await expect(processPaymentWebhook(approved.body, deps())).resolves.toBe(
      200
    );

    await expect(paymentState(paymentId, obligationId)).resolves.toStrictEqual({
      payment: {
        status: "approved",
        provider_transaction_id: approved.transaction.id,
      },
      obligationStatus: "paid",
      attempts: [
        {
          provider_transaction_id: declined.transaction.id,
          status: "declined",
          review_reason: null,
        },
        {
          provider_transaction_id: approved.transaction.id,
          status: "approved",
          review_reason: null,
        },
      ],
      paidUpdates: 1,
    });
    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([
      true,
    ]);
  });

  it("flags a second approval for review and does not pay two times", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const first = await wompiTransaction(reference, "APPROVED");
    const second = await wompiTransaction(reference, "APPROVED");

    await processPaymentWebhook(first.body, deps());
    await expect(processPaymentWebhook(second.body, deps())).resolves.toBe(200);

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: {
        status: "approved",
        provider_transaction_id: first.transaction.id,
      },
      attempts: [
        { provider_transaction_id: first.transaction.id, review_reason: null },
        {
          provider_transaction_id: second.transaction.id,
          status: "approved",
          review_reason: "second_approval",
        },
      ],
      paidUpdates: 1,
    });
    // The event stays unprocessed for staff.
    await expect(eventProcessed(second.checksum)).resolves.toStrictEqual([
      false,
    ]);
  });

  it("keeps a second approval in review when Wompi sends the event again", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const first = await wompiTransaction(reference, "APPROVED");
    const second = await wompiTransaction(reference, "APPROVED");
    await processPaymentWebhook(first.body, deps());
    await processPaymentWebhook(second.body, deps());

    await processPaymentWebhook(second.body, deps());

    await expect(eventProcessed(second.checksum)).resolves.toStrictEqual([
      false,
    ]);
    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      paidUpdates: 1,
    });
  });

  it("does nothing more on a repeat of the same transaction and status", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const id = `${unique()}-1610641025-49201`;
    const first = await wompiTransaction(reference, "APPROVED", { id });
    // Same transaction and status, other timestamp: a different checksum.
    const repeat = await wompiTransaction(reference, "APPROVED", {
      id,
      timestamp: 1_760_000_999,
    });

    await processPaymentWebhook(first.body, deps());
    await processPaymentWebhook(repeat.body, deps());
    await expect(processPaymentWebhook(first.body, deps())).resolves.toBe(200);

    const state = await paymentState(paymentId, obligationId);
    expect(state.attempts).toHaveLength(1);
    expect(state.paidUpdates).toBe(1);
    await expect(eventProcessed(first.checksum)).resolves.toStrictEqual([true]);
    await expect(eventProcessed(repeat.checksum)).resolves.toStrictEqual([
      true,
    ]);
  });

  it("processes again a delivery of an event that is not processed", async () => {
    const reference = `tp_${unique()}`;
    const approved = await wompiTransaction(reference, "APPROVED");

    // No payment has this reference yet, so the event stays unprocessed.
    await expect(processPaymentWebhook(approved.body, deps())).resolves.toBe(
      200
    );
    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([
      false,
    ]);

    const { paymentId, obligationId } = await seedPayment(reference);
    await processPaymentWebhook(approved.body, deps());

    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([
      true,
    ]);
    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "approved" },
      obligationStatus: "paid",
      paidUpdates: 1,
    });
  });

  it("records nothing for a copy with a changed unsigned name, so the real event is not a duplicate", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const approved = await wompiTransaction(reference, "APPROVED");
    // The signature does not cover the event name, so this copy has the same checksum.
    const tampered = editEventBody(approved.body, (event) => {
      event.event = "transaction.unknown";
    });

    await expect(processPaymentWebhook(tampered, deps())).resolves.toBe(200);
    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([]);

    await expect(processPaymentWebhook(approved.body, deps())).resolves.toBe(
      200
    );
    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([
      true,
    ]);
    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "approved" },
      obligationStatus: "paid",
    });
  });

  it("processes an event without the unsigned reference with the data from the API", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const approved = await wompiTransaction(reference, "APPROVED");
    const withoutReference = editEventBody(approved.body, (event) => {
      event.data = {
        transaction: { ...event.data.transaction, reference: undefined },
      };
    });

    await expect(processPaymentWebhook(withoutReference, deps())).resolves.toBe(
      200
    );

    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([
      true,
    ]);
    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "approved" },
      obligationStatus: "paid",
    });
  });

  it("records nothing when the Wompi API fails, so a new delivery can process the event", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const approved = await wompiTransaction(reference, "APPROVED");
    wompiApi.delete(approved.transaction.id);

    await expect(processPaymentWebhook(approved.body, deps())).resolves.toBe(
      502
    );
    await expect(eventProcessed(approved.checksum)).resolves.toStrictEqual([]);

    wompiApi.set(approved.transaction.id, approved.transaction);
    await processPaymentWebhook(approved.body, deps());
    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      obligationStatus: "paid",
    });
  });
});

describe("payment_event inbox", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("accepts the same checksum from another integration", async () => {
    const checksum = unique();
    await insertEvent("wompi:pub_test_a", checksum);

    await expect(
      insertEvent("wompi-payouts:principal_b", checksum)
    ).resolves.toBeDefined();
  });

  it("refuses the same checksum two times for one integration", async () => {
    const checksum = unique();
    await insertEvent("wompi:pub_test_a", checksum);

    await expect(
      insertEvent("wompi:pub_test_a", checksum)
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });
});

describe("payment_attempt table", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("gives the application role read and write access", async () => {
    const result = await database.pool.query<{
      can_insert: boolean;
      can_update: boolean;
    }>(
      `select has_table_privilege('transipay_app', 'payment_attempt', 'INSERT') as can_insert,
              has_table_privilege('transipay_app', 'payment_attempt', 'UPDATE') as can_update`
    );

    expect(result.rows.at(0)).toStrictEqual({
      can_insert: true,
      can_update: true,
    });
  });

  it("writes an audit row for each change", async () => {
    const { paymentId } = await seedPayment();
    const attemptId = await queryId(
      `insert into payment_attempt (payment_id, provider_transaction_id, status, amount_in_cents, currency)
       values ($1, $2, 'pending', $3, 'COP') returning id`,
      [paymentId, unique(), AMOUNT]
    );

    const audit = await database.pool.query(
      `select 1 from audit_log where table_name = 'payment_attempt' and record_id = $1`,
      [attemptId]
    );
    expect(audit.rowCount).toBe(1);
  });

  it("refuses a transaction id that another attempt has", async () => {
    const { paymentId } = await seedPayment();
    const transactionId = unique();
    await insertAttempt(paymentId, transactionId);

    await expect(insertAttempt(paymentId, transactionId)).rejects.toMatchObject(
      { code: UNIQUE_VIOLATION }
    );
  });
});
