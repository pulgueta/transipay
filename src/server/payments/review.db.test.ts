import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import type { PaymentAttemptReviewReason } from "@/server/db/schema/payments";
import { createTestDatabase } from "@/server/db/testing";

import { clearPaymentReview, listPaymentsUnderReview } from "./review";

const AMOUNT = 2_500_000;

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

const queryId = async (text: string, values: unknown[]) => {
  const result = await database.pool.query<{ id: string }>(text, values);
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The insert returned no row.");
  }
  return row.id;
};

const seedUser = async (role: string) =>
  await queryId(
    `insert into auth."user" (name, email, role) values ('Staff', $1, $2) returning id`,
    [`${unique()}@example.com`, role]
  );

const seedObligation = async () => {
  const entityId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ('transit_authority', 'ITTB', $1, 'ittb@example.com', '3000000000') returning id`,
    [unique()]
  );
  const citizenId = await queryId(
    `insert into citizen (document_type, document_number, first_name, last_name)
     values ('CC', $1, 'Ana', 'Rojas') returning id`,
    [unique()]
  );
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents)
     values ($1, $2, 'fine', $3, $4) returning id`,
    [citizenId, entityId, `F-${unique()}`, AMOUNT]
  );
  return { citizenId, obligationId };
};

/** An approved payment with one approved attempt. The attempt has the review reason, or none. */
const seedApprovedPayment = async (
  reviewReason: PaymentAttemptReviewReason | null
) => {
  const target = await seedObligation();
  const transactionId = `${unique()}-1610641025-49201`;
  const paymentId = await queryId(
    `insert into payment (citizen_id, obligation_id, amount_in_cents, reference, status,
       provider_transaction_id, finalized_at)
     values ($1, $2, $3, $4, 'approved', $5, now()) returning id`,
    [
      target.citizenId,
      target.obligationId,
      AMOUNT,
      `tp_${unique()}`,
      transactionId,
    ]
  );
  const attemptId = await queryId(
    `insert into payment_attempt (payment_id, provider_transaction_id, status, amount_in_cents, currency,
       review_reason, finalized_at)
     values ($1, $2, 'approved', $3, 'COP', $4, now()) returning id`,
    [paymentId, transactionId, AMOUNT, reviewReason]
  );
  return { ...target, paymentId, attemptId };
};

const attemptState = async (attemptId: string) => {
  const attempt = await database.pool.query<{
    review_reason: string | null;
    status: string;
  }>("select review_reason, status from payment_attempt where id = $1", [
    attemptId,
  ]);
  const audit = await database.pool.query<{
    actor_user_id: string | null;
    old_reason: string | null;
    new_reason: string | null;
  }>(
    `select actor_user_id, old_data ->> 'review_reason' as old_reason,
       new_data ->> 'review_reason' as new_reason
     from audit_log where table_name = 'payment_attempt' and record_id = $1 and action = 'update'`,
    [attemptId]
  );
  return { ...attempt.rows.at(0), audit: audit.rows };
};

const paymentState = async (paymentId: string) => {
  const result = await database.pool.query<{
    status: string;
    updated_at: Date;
  }>("select status, updated_at from payment where id = $1", [paymentId]);
  return result.rows.at(0);
};

describe("payments under review", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("lists only the attempts with a review reason, with the citizen and the obligation", async () => {
    const flagged = await seedApprovedPayment("target_not_payable");
    const clean = await seedApprovedPayment(null);

    const page = await listPaymentsUnderReview(appDatabase, { limit: 100 });
    const ids = page.items.map((item) => item.attemptId);

    expect(ids).toContain(flagged.attemptId);
    expect(ids).not.toContain(clean.attemptId);
    const item = page.items.find((row) => row.attemptId === flagged.attemptId);
    expect(item).toMatchObject({
      paymentId: flagged.paymentId,
      reviewReason: "target_not_payable",
      citizenName: "Ana Rojas",
      amountInCents: AMOUNT,
    });
    expect(item?.citizenDocument.startsWith("CC ")).toBeTruthy();
  });

  it("clears the review reason of the attempt and records the actor; the payment does not change", async () => {
    const actorId = await seedUser("supervisor");
    const flagged = await seedApprovedPayment("second_approval");
    const paymentBefore = await paymentState(flagged.paymentId);

    const outcome = await clearPaymentReview(appDatabase, {
      actorId,
      attemptId: flagged.attemptId,
    });

    expect(outcome.ok).toBeTruthy();
    expect(outcome.ok ? outcome.attempt : null).toMatchObject({
      id: flagged.attemptId,
      reviewReason: null,
      status: "approved",
    });
    await expect(attemptState(flagged.attemptId)).resolves.toStrictEqual({
      review_reason: null,
      status: "approved",
      audit: [
        {
          actor_user_id: actorId,
          old_reason: "second_approval",
          new_reason: null,
        },
      ],
    });
    await expect(paymentState(flagged.paymentId)).resolves.toStrictEqual(
      paymentBefore
    );
    const page = await listPaymentsUnderReview(appDatabase, { limit: 100 });
    expect(page.items.map((item) => item.attemptId)).not.toContain(
      flagged.attemptId
    );
  });

  it("refuses an attempt that is not under review", async () => {
    const actorId = await seedUser("supervisor");
    const clean = await seedApprovedPayment(null);

    await expect(
      clearPaymentReview(appDatabase, { actorId, attemptId: clean.attemptId })
    ).resolves.toStrictEqual({ ok: false, reason: "not_under_review" });
    await expect(
      clearPaymentReview(appDatabase, { actorId, attemptId: randomUUID() })
    ).resolves.toStrictEqual({ ok: false, reason: "attempt_not_found" });
  });
});
