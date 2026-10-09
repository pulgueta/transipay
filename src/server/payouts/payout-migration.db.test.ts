import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { z } from "zod";

import { createTestPool } from "@/server/db/testing";

const migrationsFolder = new URL("../../../drizzle/", import.meta.url);
// The first migration of the payout state machine. The migrations before it make the old payout table.
const FIRST_NEW_MIGRATION = "0009";

const journal = z
  .object({ entries: z.array(z.object({ tag: z.string() })) })
  .parse(
    JSON.parse(
      readFileSync(new URL("meta/_journal.json", migrationsFolder), "utf-8")
    )
  );

const applyMigrations = async (pool: Pool, tags: string[]) => {
  for (const tag of tags) {
    const text = readFileSync(new URL(`${tag}.sql`, migrationsFolder), "utf-8");
    for (const statement of text.split("--> statement-breakpoint")) {
      // oxlint-disable-next-line no-await-in-loop -- Migrations run in order.
      await pool.query(statement);
    }
  }
};

const tags = journal.entries.map((entry) => entry.tag);
const oldTags = tags.filter((tag) => tag < FIRST_NEW_MIGRATION);
const newTags = tags.filter((tag) => tag >= FIRST_NEW_MIGRATION);

let admin: Pool;
let pool: Pool;
let name: string;

const insertLegacyPayout = async (
  entityId: string,
  bankAccountId: string,
  status: string,
  providerPayoutId: string | null
) => {
  const result = await pool.query<{ id: string }>(
    `insert into payout (entity_id, entity_bank_account_id, amount_in_cents, reference, idempotency_key,
       status, provider_payout_id, finalized_at, created_at)
     values ($1, $2, 5000000, $3, $3, $4, $5, case when $4 in ('paid', 'failed') then now() end,
       '2026-10-01T10:00:00Z')
     returning id`,
    [entityId, bankAccountId, `tp_po_${randomUUID()}`, status, providerPayoutId]
  );
  const id = result.rows.at(0)?.id;
  if (id === undefined) {
    throw new Error("The insert returned no row.");
  }
  return id;
};

describe("payout state machine migration", () => {
  beforeAll(async () => {
    const source = new URL(inject("testDatabaseUrl"));
    name = `transipay_migration_${randomUUID().replaceAll("-", "")}`;
    admin = new Pool({ connectionString: source.toString() });
    await admin.query(`create database "${name}"`);
    source.pathname = `/${name}`;
    pool = createTestPool(source.toString());
    await applyMigrations(pool, oldTags);
  });

  afterAll(async () => {
    await pool.end();
    await admin.query(`drop database "${name}" with (force)`);
    await admin.end();
  });

  it("maps the old statuses and copies the bank account to the snapshot", async () => {
    const entity = await pool.query<{ id: string }>(
      `insert into entity (kind, name, tax_id, email, phone)
       values ('cda', 'CDA', '900123456', 'pagos@cda.example.com', '3000000000') returning id`
    );
    const entityId = entity.rows[0]?.id ?? "";
    const account = await pool.query<{ id: string }>(
      `insert into entity_bank_account
         (entity_id, bank_id, account_type, account_number, holder_name, holder_legal_id_type, holder_legal_id, is_default)
       values ($1, '1007', 'AHORROS', '123', 'CDA SAS', 'NIT', '900123456', true) returning id`,
      [entityId]
    );
    const accountId = account.rows[0]?.id ?? "";
    const ids = {
      pending: await insertLegacyPayout(entityId, accountId, "pending", null),
      pendingWithId: await insertLegacyPayout(
        entityId,
        accountId,
        "pending",
        "po_a"
      ),
      processing: await insertLegacyPayout(
        entityId,
        accountId,
        "processing",
        "po_b"
      ),
      paid: await insertLegacyPayout(entityId, accountId, "paid", "po_c"),
      failed: await insertLegacyPayout(entityId, accountId, "failed", null),
    };

    await applyMigrations(pool, newTags);

    const rows = await pool.query<{
      id: string;
      status: string;
      account_number: string;
      recipient_email: string;
      command_hash: string;
      retry_deadline: Date;
    }>(
      `select id, status, account_number, recipient_email, command_hash, retry_deadline
       from payout order by id`
    );
    const statusOf = (id: string) =>
      rows.rows.find((row) => row.id === id)?.status;
    expect({
      pending: statusOf(ids.pending),
      pendingWithId: statusOf(ids.pendingWithId),
      processing: statusOf(ids.processing),
      paid: statusOf(ids.paid),
      failed: statusOf(ids.failed),
    }).toStrictEqual({
      pending: "uncertain",
      pendingWithId: "submitted",
      processing: "submitted",
      paid: "paid",
      failed: "failed",
    });
    const snapshots = rows.rows.map((row) => ({
      accountNumber: row.account_number,
      recipientEmail: row.recipient_email,
      hasHash: /^[0-9a-f]{64}$/u.test(row.command_hash),
      retryDeadline: row.retry_deadline.toISOString(),
    }));
    expect(snapshots).toStrictEqual(
      rows.rows.map(() => ({
        accountNumber: "123",
        recipientEmail: "pagos@cda.example.com",
        hasHash: true,
        retryDeadline: "2026-10-02T09:00:00.000Z",
      }))
    );
  });
});
