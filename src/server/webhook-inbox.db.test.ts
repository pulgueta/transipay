import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createTestDatabase } from "@/server/db/testing";

const RAISE_EXCEPTION = "P0001";

let pool: Pool;

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

/**
 * Runs `fn` in one transaction as the application role `transipay_app`.
 * The transaction commits when `fn` resolves and rolls back when it rejects.
 */
const asApp = async <T>(fn: (client: PoolClient) => Promise<T>) => {
  const connection = await pool.connect();
  try {
    await connection.query("begin");
    await connection.query("set local role transipay_app");
    const result = await fn(connection);
    await connection.query("commit");
    return result;
  } catch (error) {
    await connection.query("rollback");
    throw error;
  } finally {
    connection.release();
  }
};

/** Records one received event as the application role and gives its id. */
const receiveEvent = async () =>
  await asApp(async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into payment_event (integration, event_type, checksum, payload)
       values ('wompi:pub_test_inbox', 'transaction.updated', $1, '{"a":1}') returning id`,
      [unique()]
    );
    const row = result.rows.at(0);
    if (!row) {
      throw new Error("The insert returned no row.");
    }
    return row.id;
  });

const runAsApp = async (statement: string, eventId: string) =>
  await asApp(async (client) => await client.query(statement, [eventId]));

const MARK_PROCESSED = `update payment_event set processed_at = now() where id = $1`;

describe("payment_event receipts", () => {
  beforeAll(() => {
    ({ pool } = createTestDatabase(inject("testDatabaseUrl")));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("refuses a delete", async () => {
    const eventId = await receiveEvent();

    await expect(
      runAsApp(`delete from payment_event where id = $1`, eventId)
    ).rejects.toMatchObject({ code: RAISE_EXCEPTION });
  });

  it.each([
    ["checksum", `update payment_event set checksum = 'other' where id = $1`],
    [
      "integration",
      `update payment_event set integration = 'wompi:other' where id = $1`,
    ],
    ["payload", `update payment_event set payload = '{"a":2}' where id = $1`],
    [
      "event_type",
      `update payment_event set event_type = 'other' where id = $1`,
    ],
    [
      "received_at",
      `update payment_event set received_at = now() - interval '1 day' where id = $1`,
    ],
  ])("refuses a change to %s", async (_column, statement) => {
    const eventId = await receiveEvent();

    await expect(runAsApp(statement, eventId)).rejects.toMatchObject({
      code: RAISE_EXCEPTION,
    });
  });

  it("lets the application set processed_at one time", async () => {
    const eventId = await receiveEvent();

    await runAsApp(MARK_PROCESSED, eventId);

    const result = await pool.query<{ processed: boolean }>(
      `select processed_at is not null as processed from payment_event where id = $1`,
      [eventId]
    );
    expect(result.rows.at(0)).toStrictEqual({ processed: true });
  });

  it.each([
    [
      "a different time",
      `update payment_event set processed_at = processed_at + interval '1 second' where id = $1`,
    ],
    ["null", `update payment_event set processed_at = null where id = $1`],
  ])(
    "refuses a change of a set processed_at to %s",
    async (_value, statement) => {
      const eventId = await receiveEvent();
      await runAsApp(MARK_PROCESSED, eventId);

      await expect(runAsApp(statement, eventId)).rejects.toMatchObject({
        code: RAISE_EXCEPTION,
      });
    }
  );
});
