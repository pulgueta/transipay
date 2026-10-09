import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createTestDatabase } from "@/server/db/testing";

import { insertPayout, payoutRow, seedEntity } from "./payout-testing";

const RAISE_EXCEPTION = "P0001";
const CHECK_VIOLATION = "23514";
const HOUR_MS = 60 * 60 * 1000;

let pool: ReturnType<typeof createTestDatabase>["pool"];

const queuedPayout = async () => {
  const seeded = await seedEntity(pool);
  return await insertPayout(pool, { ...seeded, status: "queued" });
};

const claim = async (id: string) =>
  await pool.query(
    `update payout set status = 'submitting', lease_token = uuidv7(),
       lease_expires_at = now() + interval '2 minutes' where id = $1`,
    [id]
  );

describe("payout command", () => {
  beforeAll(() => {
    ({ pool } = createTestDatabase(inject("testDatabaseUrl")));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("writes the command hash when the payout is queued", async () => {
    const { id } = await queuedPayout();

    const row = await payoutRow(pool, id);
    expect(row.command_hash).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.first_dispatch_at).toBeNull();
  });

  it("lets a draft change its command", async () => {
    const seeded = await seedEntity(pool);
    const draft = await pool.query<{ id: string }>(
      `insert into payout (entity_id, entity_bank_account_id, amount_in_cents, reference, idempotency_key)
       values ($1, $2, 100, $3, $3) returning id`,
      [seeded.entityId, seeded.bankAccountId, `tp_po_${seeded.entityId}`]
    );

    await expect(
      pool.query("update payout set amount_in_cents = 200 where id = $1", [
        draft.rows[0]?.id,
      ])
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it.each([
    ["amount_in_cents", "amount_in_cents = 1"],
    ["account_number", "account_number = '999'"],
    ["holder_legal_id", "holder_legal_id = '1'"],
    ["recipient_email", "recipient_email = 'other@example.com'"],
    ["reference", "reference = 'tp_po_other'"],
    ["idempotency_key", "idempotency_key = 'other'"],
    ["command_hash", "command_hash = 'x'"],
  ])(
    "rejects a change to %s after the payout left draft",
    async (_name, change) => {
      const { id } = await queuedPayout();

      await expect(
        pool.query(`update payout set ${change} where id = $1`, [id])
      ).rejects.toMatchObject({
        code: RAISE_EXCEPTION,
      });
    }
  );

  it("rejects a move back to draft", async () => {
    const { id } = await queuedPayout();

    await expect(
      pool.query("update payout set status = 'draft' where id = $1", [id])
    ).rejects.toMatchObject({
      code: RAISE_EXCEPTION,
    });
  });

  it("sets the first dispatch and the retry deadline (23 hours later) on the first claim", async () => {
    const { id } = await queuedPayout();

    await claim(id);

    const row = await payoutRow(pool, id);
    expect(row.first_dispatch_at).toBeInstanceOf(Date);
    expect(Number(row.retry_deadline) - Number(row.first_dispatch_at)).toBe(
      23 * HOUR_MS
    );
  });

  it("does not change the first dispatch after it is set", async () => {
    const { id } = await queuedPayout();
    await claim(id);

    await expect(
      pool.query(
        "update payout set first_dispatch_at = now() - interval '1 day' where id = $1",
        [id]
      )
    ).rejects.toMatchObject({
      code: RAISE_EXCEPTION,
    });
  });

  it("rejects a claim after the retry deadline", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, {
      ...seeded,
      status: "queued",
      firstDispatchAgo: "2 days",
    });

    await expect(claim(id)).rejects.toMatchObject({
      code: RAISE_EXCEPTION,
    });
  });

  it("rejects a change of a paid payout", async () => {
    const seeded = await seedEntity(pool);
    const { id } = await insertPayout(pool, {
      ...seeded,
      status: "paid",
      firstDispatchAgo: "1 hour",
    });

    await expect(
      pool.query("update payout set status = 'failed' where id = $1", [id])
    ).rejects.toMatchObject({
      code: RAISE_EXCEPTION,
    });
  });

  it("refuses a queued payout without a bank account snapshot", async () => {
    const seeded = await seedEntity(pool);

    await expect(
      pool.query(
        `insert into payout (entity_id, entity_bank_account_id, amount_in_cents, reference, idempotency_key, status)
         values ($1, $2, 100, $3, $3, 'queued')`,
        [seeded.entityId, seeded.bankAccountId, `tp_po_${seeded.bankAccountId}`]
      )
    ).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it("refuses a submitting payout without a lease", async () => {
    const { id } = await queuedPayout();

    await expect(
      pool.query("update payout set status = 'submitting' where id = $1", [id])
    ).rejects.toMatchObject({
      code: CHECK_VIOLATION,
    });
  });

  it("writes an audit row for each change", async () => {
    const { id } = await queuedPayout();
    await claim(id);

    const audit = await pool.query(
      "select 1 from audit_log where table_name = 'payout' and record_id = $1",
      [id]
    );
    expect(audit.rowCount).toBe(2);
  });
});
