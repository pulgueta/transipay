import type { Payout, Result } from "@pulgueta/wompi/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";
import { editEventBody } from "@/server/payments/webhook-testing";

import {
  TEST_PAYOUT_EVENTS_KEY,
  TEST_PAYOUT_INTEGRATION,
  insertPayout,
  payoutRow,
  seedEntity,
  signedPayoutEvent,
  unique,
} from "./payout-testing";
import { processPayoutWebhook } from "./webhook";
import type { PayoutWebhookDeps } from "./webhook";

let pool: Pool;
let appDatabase: Database;

/** The Wompi payouts API in these tests. A payout that is not in the map gives an error. */
const wompiApi = new Map<string, Payout>();

const deps = (): PayoutWebhookDeps => ({
  database: appDatabase,
  eventsKey: TEST_PAYOUT_EVENTS_KEY,
  integration: TEST_PAYOUT_INTEGRATION,
  getPayout: async (id) => {
    const found = wompiApi.get(id);
    return await Promise.resolve<Result<Payout>>(
      found ? [null, found] : [new Error("Not found"), null]
    );
  },
});

/** Puts the payout in the fake API and gives a signed event for it. The event body has another reference. */
const wompiPayout = async (
  payout: Payout,
  options: { properties?: string[] } = {}
) => {
  wompiApi.set(payout.id, payout);
  return await signedPayoutEvent(
    {
      payout: {
        id: payout.id,
        status: payout.status,
        reference: "tp_event_body",
        amountInCents: 100,
      },
    },
    options
  );
};

const eventProcessed = async (checksum: string) => {
  const result = await pool.query<{ processed: boolean }>(
    `select processed_at is not null as processed from payment_event
     where integration = $1 and checksum = $2`,
    [TEST_PAYOUT_INTEGRATION, checksum]
  );
  return result.rows.map((row) => row.processed);
};

const uncertainPayout = async () =>
  await insertPayout(pool, {
    ...(await seedEntity(pool)),
    status: "uncertain",
    firstDispatchAgo: "1 hour",
  });

describe("payout webhook", () => {
  beforeAll(() => {
    ({ pool } = createTestDatabase(inject("testDatabaseUrl")));
    appDatabase = drizzle(pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("finds the payout by the reference from the API, not from the event body", async () => {
    const { id, reference } = await uncertainPayout();
    const providerId = `po_${unique()}`;
    const event = await wompiPayout({
      id: providerId,
      status: "TOTAL_PAYMENT",
      reference,
    });

    await expect(processPayoutWebhook(event.body, deps())).resolves.toBe(200);

    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
      provider_payout_id: providerId,
    });
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([true]);
  });

  it("finds the payout by the provider payout id", async () => {
    const providerId = `po_${unique()}`;
    const { id } = await insertPayout(pool, {
      ...(await seedEntity(pool)),
      status: "submitted",
      firstDispatchAgo: "1 hour",
      providerPayoutId: providerId,
    });
    const event = await wompiPayout({ id: providerId, status: "REJECTED" });

    await processPayoutWebhook(event.body, deps());

    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "failed",
    });
  });

  it("refuses an event whose signature does not cover the payout id", async () => {
    const { reference } = await uncertainPayout();
    const event = await wompiPayout(
      { id: `po_${unique()}`, status: "TOTAL_PAYMENT", reference },
      { properties: ["payout.status"] }
    );

    await expect(processPayoutWebhook(event.body, deps())).resolves.toBe(401);
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([]);
  });

  it("records nothing when the Wompi API fails, so a new delivery can process the event", async () => {
    const { id, reference } = await uncertainPayout();
    const payout = { id: `po_${unique()}`, status: "TOTAL_PAYMENT", reference };
    const event = await wompiPayout(payout);
    wompiApi.delete(payout.id);

    await expect(processPayoutWebhook(event.body, deps())).resolves.toBe(502);
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([]);

    wompiApi.set(payout.id, payout);
    await processPayoutWebhook(event.body, deps());
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
    });
  });

  it("keeps an event without a matching payout unprocessed, and processes it on a new delivery", async () => {
    const seeded = await seedEntity(pool);
    const providerId = `po_${unique()}`;
    const event = await wompiPayout({
      id: providerId,
      status: "TOTAL_PAYMENT",
    });

    await processPayoutWebhook(event.body, deps());
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([
      false,
    ]);

    const { id } = await insertPayout(pool, {
      ...seeded,
      status: "submitted",
      firstDispatchAgo: "1 hour",
      providerPayoutId: providerId,
    });
    await processPayoutWebhook(event.body, deps());

    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([true]);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
    });
  });

  it("does not change a paid payout", async () => {
    const providerId = `po_${unique()}`;
    const { id } = await insertPayout(pool, {
      ...(await seedEntity(pool)),
      status: "paid",
      firstDispatchAgo: "1 hour",
      providerPayoutId: providerId,
    });
    const event = await wompiPayout({ id: providerId, status: "REJECTED" });

    await expect(processPayoutWebhook(event.body, deps())).resolves.toBe(200);

    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
    });
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([true]);
  });

  it("does not record a transaction event, because it has no effect", async () => {
    const event = await signedPayoutEvent(
      { transaction: { id: unique(), payoutId: "po_x", status: "APPROVED" } },
      {
        event: "transaction.updated",
        properties: ["transaction.id", "transaction.status"],
      }
    );

    await expect(processPayoutWebhook(event.body, deps())).resolves.toBe(200);
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([]);
  });

  it("records nothing for a copy with a changed unsigned name, so the real event is not a duplicate", async () => {
    const { id, reference } = await uncertainPayout();
    const event = await wompiPayout({
      id: `po_${unique()}`,
      status: "TOTAL_PAYMENT",
      reference,
    });
    // The signature does not cover the event name, so this copy has the same checksum.
    const tampered = editEventBody(event.body, (body) => {
      body.event = "payout.unknown";
    });

    await expect(processPayoutWebhook(tampered, deps())).resolves.toBe(200);
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([]);

    await expect(processPayoutWebhook(event.body, deps())).resolves.toBe(200);
    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([true]);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
    });
  });

  it("processes an event without the unsigned status with the data from the API", async () => {
    const { id, reference } = await uncertainPayout();
    const event = await wompiPayout(
      { id: `po_${unique()}`, status: "TOTAL_PAYMENT", reference },
      { properties: ["payout.id"] }
    );
    const withoutStatus = editEventBody(event.body, (body) => {
      body.data = { payout: { ...body.data.payout, status: undefined } };
    });

    await expect(processPayoutWebhook(withoutStatus, deps())).resolves.toBe(
      200
    );

    await expect(eventProcessed(event.checksum)).resolves.toStrictEqual([true]);
    await expect(payoutRow(pool, id)).resolves.toMatchObject({
      status: "paid",
    });
  });
});
