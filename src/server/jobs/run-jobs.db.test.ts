import { randomUUID } from "node:crypto";

import type {
  CreatePayoutInput,
  CreatePayoutResult,
  Result,
  Transaction,
} from "@pulgueta/wompi/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  inject,
  it,
} from "vitest";

import { schema } from "@/server/db/client";
import { createIsolatedDatabase } from "@/server/db/testing";
import { SETTLE_WINDOW_MS } from "@/server/payments/checkout";
import {
  insertPayout,
  payoutRow,
  seedEntity,
} from "@/server/payouts/payout-testing";

import {
  SWEEP_MIN_AGE_MS,
  SWEEP_PAGE_SIZE,
  runScheduledJobs,
} from "./run-jobs";
import type { ScheduledJobsDeps } from "./run-jobs";

const AMOUNT = 4_000_000;

let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
let pool: Pool;
let deps: ScheduledJobsDeps;

/** Every createPayout call that reached the fake Wompi payouts API. */
const sends: CreatePayoutInput[] = [];
let answerPayout: () => Promise<Result<CreatePayoutResult>>;
/** When true, createPayout throws, as on a network error. */
let sendsThrow = false;
/** The fake Wompi payments API: the transactions of each reference. A missing reference has no transaction. */
const wompiTransactions = new Map<string, Transaction[]>();
/** References whose lookup throws, as on a network error. */
const failingReferences = new Set<string>();
/** Every reference that the fake Wompi payments API was asked for. */
const lookedUp: string[] = [];

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

const queryId = async (text: string, values: unknown[]) => {
  const result = await pool.query<{ id: string }>(text, values);
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The insert returned no row.");
  }
  return row.id;
};

/**
 * A payment for a new obligation. `ageMs` sets the start of the checkout in the past.
 * A declined payment gets its declined attempt, as the webhook leaves it.
 */
const seedPayment = async (
  ageMs: number,
  { status = "pending" }: { status?: "pending" | "declined" } = {}
) => {
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
    `insert into payment (citizen_id, obligation_id, amount_in_cents, reference, created_at, status,
       finalized_at)
     values ($1, $2, $3, $4, $5, $6, case when $6 = 'pending' then null else now() end) returning id`,
    [
      citizenId,
      obligationId,
      AMOUNT,
      reference,
      new Date(Date.now() - ageMs),
      status,
    ]
  );
  if (status === "declined") {
    await pool.query(
      `insert into payment_attempt (payment_id, provider_transaction_id, status, amount_in_cents, currency, finalized_at)
       values ($1, $2, 'declined', $3, 'COP', now())`,
      [paymentId, `${unique()}-1610641025-49201`, AMOUNT]
    );
  }
  return { paymentId, obligationId, reference };
};

const OLD = SWEEP_MIN_AGE_MS + 60_000;
const YOUNG = SWEEP_MIN_AGE_MS - 60_000;

const approved = (reference: string): Transaction => ({
  id: `${unique()}-1610641025-49201`,
  status: "APPROVED",
  reference,
  amount_in_cents: AMOUNT,
  currency: "COP",
  payment_method_type: "CARD",
});

const paymentStatus = async (paymentId: string) => {
  const result = await pool.query<{ status: string }>(
    "select status from payment where id = $1",
    [paymentId]
  );
  return result.rows.at(0)?.status;
};

const paidUpdates = async (obligationId: string) => {
  const result = await pool.query<{ count: string }>(
    `select count(*) from audit_log where table_name = 'obligation'
       and record_id = $1 and action = 'update' and new_data ->> 'status' = 'paid'`,
    [obligationId]
  );
  return Number(result.rows.at(0)?.count);
};

describe(runScheduledJobs, () => {
  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("testDatabaseUrl"));
    ({ pool } = isolated);
    const database = drizzle(pool, { schema, casing: "snake_case" });
    deps = {
      payouts: {
        database,
        originAccountId: "acc_test",
        actorId: null,
        payouts: {
          createPayout: async (input) => {
            sends.push(input);
            if (sendsThrow) {
              throw new Error("Network error");
            }
            return await answerPayout();
          },
          listTransactionsByReference: async () =>
            await Promise.resolve([null, { records: [] }]),
        },
      },
      payments: {
        database,
        listTransactions: async (reference) => {
          lookedUp.push(reference);
          if (failingReferences.has(reference)) {
            throw new Error("Network error");
          }
          return await Promise.resolve<Result<Transaction[]>>([
            null,
            wompiTransactions.get(reference) ?? [],
          ]);
        },
      },
    };
  });

  // The jobs read all open payouts and payments. Close the rows of earlier tests, so that each test sees only its own.
  beforeEach(async () => {
    await pool.query(
      `update payout set status = 'failed', finalized_at = now(), lease_token = null,
         lease_expires_at = null, review_reason = null
       where status in ('queued', 'submitting', 'submitted', 'uncertain')`
    );
    await pool.query(
      "update payment set status = 'expired', finalized_at = now() where status = 'pending'"
    );
    // A payment that is not approved can still settle inside the window. Move the old ones out of it.
    await pool.query(
      "update payment set created_at = now() - interval '2 days' where status <> 'approved'"
    );
    sends.length = 0;
    wompiTransactions.clear();
    failingReferences.clear();
    lookedUp.length = 0;
    sendsThrow = false;
    answerPayout = async () =>
      await Promise.resolve([null, { payoutId: `po_${unique()}` }]);
  });

  afterAll(async () => {
    await isolated.drop();
  });

  it("sends a queued payout one time over two runs", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, { ...seeded, status: "queued" });

    const first = await runScheduledJobs(deps);
    const second = await runScheduledJobs(deps);

    expect(first.payouts).toStrictEqual({ ok: true, sent: 1 });
    expect(second.payouts).toStrictEqual({ ok: true, sent: 0 });
    expect(sends).toHaveLength(1);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "submitted",
    });
  });

  it("sends a payout and pays an obligation one time when two runs overlap", async () => {
    const seeded = await seedEntity(pool);
    await insertPayout(pool, { ...seeded, status: "queued" });
    const { paymentId, obligationId, reference } = await seedPayment(OLD);
    wompiTransactions.set(reference, [approved(reference)]);

    const results = await Promise.all([
      runScheduledJobs(deps),
      runScheduledJobs(deps),
    ]);

    expect(sends).toHaveLength(1);
    expect(
      results.map((result) => (result.payouts.ok ? result.payouts.sent : -1))
    ).toStrictEqual(expect.arrayContaining([0, 1]));
    await expect(paymentStatus(paymentId)).resolves.toBe("approved");
    await expect(paidUpdates(obligationId)).resolves.toBe(1);
  });

  it("reconciles a payment with a lost webhook one time", async () => {
    const { paymentId, obligationId, reference } = await seedPayment(OLD);
    wompiTransactions.set(reference, [approved(reference)]);

    const first = await runScheduledJobs(deps);
    const second = await runScheduledJobs(deps);

    expect(first.payments).toStrictEqual({ ok: true, processed: 1, failed: 0 });
    expect(second.payments).toStrictEqual({
      ok: true,
      processed: 0,
      failed: 0,
    });
    await expect(paymentStatus(paymentId)).resolves.toBe("approved");
    await expect(paidUpdates(obligationId)).resolves.toBe(1);
  });

  it("skips a payment whose checkout started less than the minimum age ago", async () => {
    const { paymentId, reference } = await seedPayment(YOUNG);
    wompiTransactions.set(reference, [approved(reference)]);

    const result = await runScheduledJobs(deps);

    expect(result.payments).toStrictEqual({
      ok: true,
      processed: 0,
      failed: 0,
    });
    expect(lookedUp).not.toContain(reference);
    await expect(paymentStatus(paymentId)).resolves.toBe("pending");
  });

  it("reconciles a declined payment inside the settle window", async () => {
    const { paymentId, obligationId, reference } = await seedPayment(OLD, {
      status: "declined",
    });
    wompiTransactions.set(reference, [approved(reference)]);

    const result = await runScheduledJobs(deps);

    expect(result.payments).toStrictEqual({
      ok: true,
      processed: 1,
      failed: 0,
    });
    await expect(paymentStatus(paymentId)).resolves.toBe("approved");
    await expect(paidUpdates(obligationId)).resolves.toBe(1);
  });

  it("skips a declined payment after the settle window", async () => {
    const { paymentId, reference } = await seedPayment(
      SETTLE_WINDOW_MS + 60_000,
      { status: "declined" }
    );
    wompiTransactions.set(reference, [approved(reference)]);

    const result = await runScheduledJobs(deps);

    expect(result.payments).toStrictEqual({
      ok: true,
      processed: 0,
      failed: 0,
    });
    expect(lookedUp).not.toContain(reference);
    await expect(paymentStatus(paymentId)).resolves.toBe("declined");
  });

  it("continues the sweep after a payment that fails", async () => {
    const throwing = await seedPayment(OLD);
    const good = await seedPayment(OLD);
    failingReferences.add(throwing.reference);
    wompiTransactions.set(good.reference, [approved(good.reference)]);

    const result = await runScheduledJobs(deps);

    expect(result.payments).toStrictEqual({
      ok: true,
      processed: 1,
      failed: 1,
    });
    await expect(paymentStatus(throwing.paymentId)).resolves.toBe("pending");
    await expect(paymentStatus(good.paymentId)).resolves.toBe("approved");
  });

  it("reads the pending payments past the first page", async () => {
    const payments = [];
    for (let index = 0; index <= SWEEP_PAGE_SIZE; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- The seed inserts are few and run in order.
      payments.push(await seedPayment(OLD));
    }

    const result = await runScheduledJobs(deps);

    expect(result.payments).toStrictEqual({
      ok: true,
      processed: SWEEP_PAGE_SIZE + 1,
      failed: 0,
    });
    expect(new Set(lookedUp)).toStrictEqual(
      new Set(payments.map((seeded) => seeded.reference))
    );
  });

  it("sweeps the payments when the payout queue fails", async () => {
    const seeded = await seedEntity(pool);
    await insertPayout(pool, { ...seeded, status: "queued" });
    sendsThrow = true;
    const { paymentId, reference } = await seedPayment(OLD);
    wompiTransactions.set(reference, [approved(reference)]);

    const result = await runScheduledJobs(deps);

    expect(result).toStrictEqual({
      payouts: { ok: false },
      payments: { ok: true, processed: 1, failed: 0 },
    });
    await expect(paymentStatus(paymentId)).resolves.toBe("approved");
  });
});
