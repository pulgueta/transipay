import { randomUUID } from "node:crypto";

import type { Result, Transaction } from "@pulgueta/wompi/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { CHECKOUT_TTL_MS } from "./checkout";
import { reconcilePayment } from "./reconcile";
import type { ReconcileDeps } from "./reconcile";

const AMOUNT = 4_000_000;

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

/** The Wompi API in these tests: the transactions of each reference. A reference that is not in the map fails. */
const wompiApi = new Map<string, Transaction[]>();

const deps = (): ReconcileDeps => ({
  database: appDatabase,
  listTransactions: async (reference) => {
    const found = wompiApi.get(reference);
    return await Promise.resolve<Result<Transaction[]>>(
      found ? [null, found] : [new Error("Service unavailable"), null]
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

const seedPayment = async (options: { createdAt?: Date } = {}) => {
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
  const reference = `tp_${unique()}`;
  const paymentId = await queryId(
    `insert into payment (citizen_id, obligation_id, amount_in_cents, reference, created_at)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      citizenId,
      obligationId,
      AMOUNT,
      reference,
      options.createdAt ?? new Date(),
    ]
  );
  return { paymentId, obligationId, reference };
};

const transaction = (
  reference: string,
  status: Transaction["status"],
  options: { amountInCents?: number; createdAt?: string } = {}
): Transaction => ({
  id: `${unique()}-1610641025-49201`,
  status,
  reference,
  amount_in_cents: options.amountInCents ?? AMOUNT,
  currency: "COP",
  payment_method_type: "CARD",
  created_at: options.createdAt,
});

const paymentState = async (paymentId: string, obligationId: string) => {
  const payments = await database.pool.query<{
    status: string;
    provider_transaction_id: string | null;
    finalized: boolean;
  }>(
    "select status, provider_transaction_id, finalized_at is not null as finalized from payment where id = $1",
    [paymentId]
  );
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

describe(reconcilePayment, () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("approves the payment and pays the obligation one time when the webhook was lost", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const approved = transaction(reference, "APPROVED");
    wompiApi.set(reference, [approved]);

    await expect(reconcilePayment(paymentId, deps())).resolves.toStrictEqual({
      kind: "reconciled",
    });
    await expect(reconcilePayment(paymentId, deps())).resolves.toStrictEqual({
      kind: "reconciled",
    });

    await expect(paymentState(paymentId, obligationId)).resolves.toStrictEqual({
      payment: {
        status: "approved",
        provider_transaction_id: approved.id,
        finalized: true,
      },
      obligationStatus: "paid",
      attempts: [
        {
          provider_transaction_id: approved.id,
          status: "approved",
          review_reason: null,
        },
      ],
      paidUpdates: 1,
    });
  });

  it("applies a decline and then the approved retry in the order Wompi made them", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const declined = transaction(reference, "DECLINED", {
      createdAt: "2026-10-08T12:00:00.000Z",
    });
    const approved = transaction(reference, "APPROVED", {
      createdAt: "2026-10-08T12:05:00.000Z",
    });
    wompiApi.set(reference, [approved, declined]);

    await reconcilePayment(paymentId, deps());

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "approved", provider_transaction_id: approved.id },
      obligationStatus: "paid",
      attempts: [
        { provider_transaction_id: declined.id, status: "declined" },
        { provider_transaction_id: approved.id, status: "approved" },
      ],
      paidUpdates: 1,
    });
  });

  it("records a pending transaction and keeps the payment pending", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    const pending = transaction(reference, "PENDING");
    wompiApi.set(reference, [pending]);

    await reconcilePayment(paymentId, deps());

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "pending", provider_transaction_id: null },
      obligationStatus: "pending",
      attempts: [{ provider_transaction_id: pending.id, status: "pending" }],
    });
  });

  it("ignores a transaction that has another reference", async () => {
    const other = await seedPayment();
    const { paymentId, obligationId, reference } = await seedPayment();
    wompiApi.set(reference, [transaction(other.reference, "APPROVED")]);

    await reconcilePayment(paymentId, deps());

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "pending" },
      attempts: [],
    });
    await expect(
      paymentState(other.paymentId, other.obligationId)
    ).resolves.toMatchObject({ payment: { status: "pending" }, attempts: [] });
  });

  it("closes an expired checkout that has no transaction", async () => {
    const { paymentId, obligationId, reference } = await seedPayment({
      createdAt: new Date(Date.now() - CHECKOUT_TTL_MS - 1000),
    });
    wompiApi.set(reference, []);

    await expect(reconcilePayment(paymentId, deps())).resolves.toStrictEqual({
      kind: "reconciled",
    });

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "expired", finalized: true },
      obligationStatus: "pending",
      attempts: [],
    });
  });

  it("keeps an open checkout that has no transaction yet", async () => {
    const { paymentId, obligationId, reference } = await seedPayment();
    wompiApi.set(reference, []);

    await reconcilePayment(paymentId, deps());

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "pending", finalized: false },
    });
  });

  it("changes nothing and reports unavailable when the Wompi API fails", async () => {
    const { paymentId, obligationId, reference } = await seedPayment({
      createdAt: new Date(Date.now() - CHECKOUT_TTL_MS - 1000),
    });
    wompiApi.delete(reference);

    await expect(reconcilePayment(paymentId, deps())).resolves.toStrictEqual({
      kind: "unavailable",
    });

    await expect(paymentState(paymentId, obligationId)).resolves.toMatchObject({
      payment: { status: "pending" },
    });
  });

  it("reports not found for a payment that does not exist", async () => {
    await expect(reconcilePayment(randomUUID(), deps())).resolves.toStrictEqual(
      { kind: "not_found" }
    );
  });
});
