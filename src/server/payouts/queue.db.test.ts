import type {
  CreatePayoutInput,
  CreatePayoutResult,
  PayoutPage,
  PayoutTransaction,
  Result,
} from "@pulgueta/wompi/schemas";
import { WompiRequestError } from "@pulgueta/wompi/schemas";
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

import {
  TEST_ORIGIN_ACCOUNT,
  insertPayout,
  payoutRow,
  seedEntity,
  unique,
} from "./payout-testing";
import type { PayoutDeps } from "./port";
import {
  BATCH_SIZE,
  claimPayout,
  createPayout,
  dispatchQueuedPayouts,
  reconcilePayouts,
  runPayoutQueue,
  sendClaimed,
  sweepPayouts,
} from "./queue";

const AMOUNT = 5_000_000;
const ORIGIN_ACCOUNT = TEST_ORIGIN_ACCOUNT;

let isolated: Awaited<ReturnType<typeof createIsolatedDatabase>>;
let pool: Pool;
let deps: PayoutDeps;

/** Every createPayout call that reached the fake Wompi API. */
const sends: { input: CreatePayoutInput; idempotencyKey: string }[] = [];
let answer: (input: CreatePayoutInput) => Promise<Result<CreatePayoutResult>>;
const lookups = new Map<string, Result<PayoutPage<PayoutTransaction>>>();
/** Every reference that the fake Wompi API was asked for, in order. */
const lookedUp: string[] = [];
/** References whose lookup throws, as on a network error. */
const failingLookups = new Set<string>();

/** A lookup answer: Wompi paid the payout. */
const paidLookup = (
  payoutId: string
): Result<PayoutPage<PayoutTransaction>> => [
  null,
  {
    records: [
      {
        id: `tx_${payoutId}`,
        status: "APPROVED",
        payout: { id: `po_${payoutId}`, status: "TOTAL_PAYMENT" },
      },
    ],
  },
];

const accepted = async (): Promise<Result<CreatePayoutResult>> =>
  await Promise.resolve([null, { payoutId: `po_${unique()}` }]);

const timeout = async (): Promise<Result<CreatePayoutResult>> =>
  await Promise.resolve([new WompiRequestError(408, {}), null]);

/** The payout id of a created payout. Throws for another result. */
const createdId = (result: Awaited<ReturnType<typeof createPayout>>) => {
  if (result.kind !== "ok") {
    throw new Error(`The payout was not created: ${result.kind}.`);
  }
  return result.payoutId;
};

/** Seconds until the next reconciliation of a payout, from the database clock. */
const secondsToNextReconcile = async (id: string) => {
  const result = await pool.query<{ seconds: number | null }>(
    `select extract(epoch from next_reconcile_at - now())::float8 as seconds
     from payout where id = $1`,
    [id]
  );
  return result.rows.at(0)?.seconds ?? null;
};

const request = (entityId: string) => ({
  entityId,
  amountInCents: AMOUNT,
  idempotencyKey: unique(),
});

describe("payout queue", () => {
  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("testDatabaseUrl"));
    ({ pool } = isolated);
    deps = {
      database: drizzle(pool, { schema, casing: "snake_case" }),
      originAccountId: ORIGIN_ACCOUNT,
      actorId: null,
      payouts: {
        createPayout: async (input, options) => {
          sends.push({ input, idempotencyKey: options.idempotencyKey });
          return await answer(input);
        },
        listTransactionsByReference: async (reference) => {
          lookedUp.push(reference);
          if (failingLookups.has(reference)) {
            throw new Error("Network error");
          }
          return await Promise.resolve(
            lookups.get(reference) ?? [null, { records: [] }]
          );
        },
      },
    };
  });

  // The queue reads all open payouts. Close the payouts of earlier tests, so that each test sees only its own.
  beforeEach(async () => {
    await pool.query(
      `update payout set status = 'failed', finalized_at = now(), lease_token = null,
         lease_expires_at = null, review_reason = null
       where status in ('queued', 'submitting', 'submitted', 'uncertain')`
    );
    sends.length = 0;
    lookups.clear();
    lookedUp.length = 0;
    failingLookups.clear();
    answer = accepted;
  });

  afterAll(async () => {
    await isolated.drop();
  });

  it("queues the snapshot, sends it, and returns the status from the database", async () => {
    const { entityId } = await seedEntity(pool);
    const input = request(entityId);

    const result = await createPayout(deps, input);

    expect(result).toMatchObject({ kind: "ok", status: "submitted" });
    expect(sends).toHaveLength(1);
    expect(sends[0]?.input.reference).toMatch(/^tp_po_/u);
    expect(sends[0]).toMatchObject({
      idempotencyKey: input.idempotencyKey,
      input: {
        accountId: ORIGIN_ACCOUNT,
        transactions: [
          {
            bankId: "1007",
            legalIdType: "NIT",
            email: "pagos@cda.example.com",
            amount: AMOUNT,
          },
        ],
      },
    });
  });

  it("returns a known key with its stored status, also when the entity has no default bank account", async () => {
    const { entityId } = await seedEntity(pool);
    const input = request(entityId);
    const first = await createPayout(deps, input);
    await pool.query(
      "update entity_bank_account set is_default = false where entity_id = $1",
      [entityId]
    );

    const second = await createPayout(deps, input);

    expect(second).toStrictEqual(first);
    expect(sends).toHaveLength(1);
  });

  it("refuses a known key for another request", async () => {
    const { entityId } = await seedEntity(pool);
    const input = request(entityId);
    await createPayout(deps, input);

    await expect(
      createPayout(deps, { ...input, amountInCents: 1 })
    ).resolves.toStrictEqual({ kind: "conflict" });
  });

  it("refuses a new key when the entity has no default bank account", async () => {
    const { entityId } = await seedEntity(pool);
    await pool.query(
      "update entity_bank_account set is_default = false where entity_id = $1",
      [entityId]
    );

    await expect(createPayout(deps, request(entityId))).resolves.toStrictEqual({
      kind: "no_default_account",
    });
  });

  it("moves a payout to uncertain after HTTP 408 and does not send it again without reconciliation", async () => {
    answer = timeout;
    const { entityId } = await seedEntity(pool);
    const input = request(entityId);

    await expect(createPayout(deps, input)).resolves.toMatchObject({
      status: "uncertain",
    });
    await expect(createPayout(deps, input)).resolves.toMatchObject({
      status: "uncertain",
    });
    await dispatchQueuedPayouts(deps);

    expect(sends).toHaveLength(1);
  });

  it("sends an uncertain payout again with the same key and snapshot when Wompi has no transaction before the deadline", async () => {
    answer = timeout;
    const { entityId } = await seedEntity(pool);
    const input = request(entityId);
    const first = await createPayout(deps, input);
    await pool.query(
      "update entity_bank_account set account_number = 'changed' where entity_id = $1",
      [entityId]
    );
    answer = accepted;

    await runPayoutQueue(deps);

    expect(sends).toHaveLength(2);
    expect(sends[1]).toStrictEqual(sends[0]);
    expect(sends[1]?.input.transactions[0]).not.toMatchObject({
      accountNumber: "changed",
    });
    await expect(payoutRow(pool, createdId(first))).resolves.toMatchObject({
      status: "submitted",
    });
  });

  it("sends the stored origin account, also after the configuration changes", async () => {
    answer = timeout;
    const { entityId } = await seedEntity(pool);
    const first = await createPayout(deps, request(entityId));
    answer = accepted;

    await runPayoutQueue({ ...deps, originAccountId: "acc_other" });

    expect(sends.map((send) => send.input.accountId)).toStrictEqual([
      ORIGIN_ACCOUNT,
      ORIGIN_ACCOUNT,
    ]);
    await expect(payoutRow(pool, createdId(first))).resolves.toMatchObject({
      status: "submitted",
    });
  });

  it("sends a queued payout with its stored origin account when the configuration is missing", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, { ...seeded, status: "queued" });

    await runPayoutQueue({ ...deps, originAccountId: undefined });

    expect(sends.map((send) => send.input.accountId)).toStrictEqual([
      ORIGIN_ACCOUNT,
    ]);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "submitted",
    });
  });

  it("keeps a queued payout without a stored origin account for staff, and never sends it with the configuration", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, {
      ...seeded,
      status: "queued",
      originAccountId: null,
    });

    await runPayoutQueue(deps);
    await runPayoutQueue(deps);

    expect(sends).toHaveLength(0);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "queued",
      review_reason: "origin_account_missing",
    });
  });

  it("refuses a new payout when the origin account is not configured", async () => {
    const { entityId } = await seedEntity(pool);

    await expect(
      createPayout({ ...deps, originAccountId: undefined }, request(entityId))
    ).resolves.toStrictEqual({ kind: "not_configured" });
  });

  it("keeps an uncertain payout for staff after the deadline when Wompi has no transaction", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, {
      ...seeded,
      status: "uncertain",
      firstDispatchAgo: "2 days",
    });

    await runPayoutQueue(deps);

    expect(sends).toHaveLength(0);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "uncertain",
      review_reason: "not_found_after_deadline",
    });
  });

  it("applies the status that Wompi has for an uncertain payout", async () => {
    const seeded = await seedEntity(pool);
    const { id, reference } = await insertPayout(pool, {
      ...seeded,
      status: "uncertain",
      firstDispatchAgo: "1 hour",
    });
    lookups.set(reference, [
      null,
      {
        records: [
          {
            id: "tx_1",
            status: "APPROVED",
            payout: { id: `po_${id}`, status: "TOTAL_PAYMENT" },
          },
        ],
      },
    ]);

    await runPayoutQueue(deps);

    expect(sends).toHaveLength(0);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
      provider_payout_id: `po_${id}`,
      review_reason: null,
    });
  });

  it("does not overwrite a status that a webhook set during the send", async () => {
    answer = async (input) => {
      await pool.query(
        `update payout set status = 'paid', finalized_at = now(), lease_token = null,
           lease_expires_at = null, provider_payout_id = 'po_webhook'
         where reference = $1`,
        [input.reference]
      );
      return await accepted();
    };
    const { entityId } = await seedEntity(pool);

    const result = await createPayout(deps, request(entityId));

    expect(result).toMatchObject({ kind: "ok", status: "paid" });
    await expect(payoutRow(pool, createdId(result))).resolves.toMatchObject({
      provider_payout_id: "po_webhook",
    });
  });

  it("moves a payout with an expired lease to uncertain and does not send it again", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, { ...seeded, status: "queued" });
    await expect(claimPayout(deps, { payoutId: id })).resolves.toMatchObject({
      id,
    });
    await pool.query(
      "update payout set lease_expires_at = now() - interval '1 minute' where id = $1",
      [id]
    );

    await sweepPayouts(deps);
    await dispatchQueuedPayouts(deps);

    expect(sends).toHaveLength(0);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "uncertain",
      lease_token: null,
    });
  });

  it("skips a payout that another claimer holds, and does not wait for it", async () => {
    const seeded = await seedEntity(pool);
    const held = await insertPayout(pool, { ...seeded, status: "queued" });
    const free = await insertPayout(pool, { ...seeded, status: "queued" });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select 1 from payout where id = $1 for update", [
        held.id,
      ]);

      await expect(
        claimPayout(deps, { payoutId: held.id })
      ).resolves.toBeNull();
      await expect(
        claimPayout(deps, { payoutId: free.id })
      ).resolves.toMatchObject({ id: free.id });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("gives a payout to only one of two concurrent claimers", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, { ...seeded, status: "queued" });

    const claims = await Promise.all([
      claimPayout(deps, { payoutId: id }),
      claimPayout(deps, { payoutId: id }),
    ]);

    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it("reconciles the newer payouts when the oldest batch has no news", async () => {
    const seeded = await seedEntity(pool);
    const payouts: Awaited<ReturnType<typeof insertPayout>>[] = [];
    for (let index = 0; index < BATCH_SIZE + 5; index += 1) {
      payouts.push(
        // oxlint-disable-next-line no-await-in-loop -- The ids must be in insert order.
        await insertPayout(pool, {
          ...seeded,
          status: "submitted",
          firstDispatchAgo: "2 hours",
        })
      );
    }
    // No news for two hours, and due for reconciliation now.
    await pool.query(
      `update payout set updated_at = now() - interval '2 hours',
         next_reconcile_at = now() - interval '1 minute'
       where status = 'submitted'`
    );
    // Wompi has no news for the oldest payouts, and paid the newest payouts.
    const newest = payouts.slice(BATCH_SIZE);
    for (const item of newest) {
      lookups.set(item.reference, paidLookup(item.id));
    }

    await reconcilePayouts(deps);
    await reconcilePayouts(deps);

    const result = await pool.query<{ status: string }>(
      "select status from payout where id = any($1)",
      [newest.map((item) => item.id)]
    );
    expect(result.rows.map((row) => row.status)).toStrictEqual(
      newest.map(() => "paid")
    );
  });

  it("continues after a lookup error and checks that payout again later", async () => {
    const seeded = await seedEntity(pool);
    const failing = await insertPayout(pool, {
      ...seeded,
      status: "uncertain",
      firstDispatchAgo: "1 hour",
    });
    const found = await insertPayout(pool, {
      ...seeded,
      status: "uncertain",
      firstDispatchAgo: "1 hour",
    });
    failingLookups.add(failing.reference);
    lookups.set(found.reference, paidLookup(found.id));

    await reconcilePayouts(deps);
    await reconcilePayouts(deps);

    await expect(payoutRow(pool, found.id)).resolves.toMatchObject({
      status: "paid",
    });
    await expect(payoutRow(pool, failing.id)).resolves.toMatchObject({
      status: "uncertain",
    });
    expect(lookedUp.filter((item) => item === failing.reference)).toHaveLength(
      1
    );
    await expect(secondsToNextReconcile(failing.id)).resolves.toBeGreaterThan(
      0
    );
  });

  it("does not check a payout for staff again before its next time", async () => {
    const seeded = await seedEntity(pool);
    const { id, reference } = await insertPayout(pool, {
      ...seeded,
      status: "uncertain",
      firstDispatchAgo: "2 days",
    });

    await reconcilePayouts(deps);
    await reconcilePayouts(deps);

    expect(lookedUp.filter((item) => item === reference)).toHaveLength(1);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      review_reason: "not_found_after_deadline",
    });
    await expect(secondsToNextReconcile(id)).resolves.toBeGreaterThan(
      23 * 60 * 60
    );
  });

  it("does not send a claimed payout when its lease ended before the send", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, { ...seeded, status: "queued" });
    const claimed = await claimPayout(deps, { payoutId: id });
    if (!claimed) {
      throw new Error("The payout was not claimed.");
    }
    await pool.query(
      "update payout set lease_expires_at = now() - interval '1 second' where id = $1",
      [id]
    );

    await sendClaimed(deps, claimed);

    expect(sends).toHaveLength(0);
    // The lease sweep moves it to uncertain.
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "submitting",
    });
  });

  it("does not send a claimed payout when its retry deadline passed before the send", async () => {
    const seeded = await seedEntity(pool);
    // The retry deadline is two seconds after the claim.
    const { id } = await insertPayout(pool, {
      ...seeded,
      status: "queued",
      firstDispatchAgo: "22 hours 59 minutes 58 seconds",
    });
    const claimed = await claimPayout(deps, { payoutId: id });
    if (!claimed) {
      throw new Error("The payout was not claimed.");
    }
    await pool.query("select pg_sleep(2.5)");

    await sendClaimed(deps, claimed);

    expect(sends).toHaveLength(0);
  });
});
