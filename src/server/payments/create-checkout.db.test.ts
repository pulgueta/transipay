import { randomUUID } from "node:crypto";

import type { Result, Transaction } from "@pulgueta/wompi/schemas";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { CHECKOUT_TTL_MS, SETTLE_WINDOW_MS } from "./checkout";
import { createCheckout } from "./create-checkout";
import type { CreateCheckoutDeps } from "./create-checkout";
import { reconcilePayment } from "./reconcile";

const AMOUNT = 4_000_000;

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

/** The Wompi API in these tests: the transactions of each reference. A reference that is not in the map fails. */
const wompiApi = new Map<string, Transaction[]>();

/** Reconciles with the fake Wompi API. */
const withWompi = (): CreateCheckoutDeps => ({
  database: appDatabase,
  reconcile: async (paymentId, actorUserId) =>
    await reconcilePayment(
      paymentId,
      {
        database: appDatabase,
        listTransactions: async (reference) => {
          const found = wompiApi.get(reference);
          return await Promise.resolve<Result<Transaction[]>>(
            found ? [null, found] : [new Error("Service unavailable"), null]
          );
        },
      },
      actorUserId
    ),
});

/** Does not ask Wompi. Records the payments that the checkout wanted to reconcile. */
const withoutWompi = (reconciled: string[] = []): CreateCheckoutDeps => ({
  database: appDatabase,
  reconcile: async (paymentId) => {
    reconciled.push(paymentId);
    return await Promise.resolve({ kind: "reconciled" });
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
  const userId = await queryId(
    `insert into auth."user" (name, email, role) values ('Ana', $1, 'citizen') returning id`,
    [`${unique()}@example.com`]
  );
  const entityId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ('transit_authority', 'Entity', $1, 'entity@example.com', '3000000000') returning id`,
    [unique()]
  );
  const citizenId = await queryId(
    `insert into citizen (user_id, document_type, document_number, first_name, last_name)
     values ($1, 'CC', $2, 'Ana', 'Rojas') returning id`,
    [userId, unique()]
  );
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents)
     values ($1, $2, 'fine', $3, $4) returning id`,
    [citizenId, entityId, unique(), AMOUNT]
  );
  return {
    citizenId,
    obligationId,
    input: { userId, actorId: userId, obligationId, installmentId: null },
  };
};

const seedPendingPayment = async (
  target: { citizenId: string; obligationId: string },
  options: {
    amountInCents?: number;
    createdAt?: Date;
    installmentId?: string;
  } = {}
) => {
  const reference = `tp_${unique()}`;
  const paymentId = await queryId(
    `insert into payment (citizen_id, obligation_id, installment_id, amount_in_cents, reference, created_at)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      target.citizenId,
      target.obligationId,
      options.installmentId ?? null,
      options.amountInCents ?? AMOUNT,
      reference,
      options.createdAt ?? new Date(),
    ]
  );
  return { paymentId, reference };
};

const transaction = (
  reference: string,
  status: Transaction["status"],
  options: { createdAt?: string } = {}
): Transaction => ({
  id: `${unique()}-1610641025-49201`,
  status,
  reference,
  amount_in_cents: AMOUNT,
  currency: "COP",
  payment_method_type: "CARD",
  created_at: options.createdAt,
});

/** A payment that left 'pending' with one final attempt, as the webhook leaves it. */
const seedSettledPayment = async (
  target: { citizenId: string; obligationId: string },
  status: "declined" | "approved",
  options: { createdAt?: Date } = {}
) => {
  const reference = `tp_${unique()}`;
  const attempt = transaction(
    reference,
    status === "approved" ? "APPROVED" : "DECLINED"
  );
  const paymentId = await queryId(
    `insert into payment (citizen_id, obligation_id, amount_in_cents, reference, status,
       provider_transaction_id, finalized_at, created_at)
     values ($1, $2, $3, $4, $5, $6, now(), $7) returning id`,
    [
      target.citizenId,
      target.obligationId,
      AMOUNT,
      reference,
      status,
      attempt.id,
      options.createdAt ?? new Date(),
    ]
  );
  await database.pool.query(
    `insert into payment_attempt (payment_id, provider_transaction_id, status, amount_in_cents, currency, finalized_at)
     values ($1, $2, $3, $4, 'COP', now())`,
    [paymentId, attempt.id, status, AMOUNT]
  );
  return { paymentId, reference, attempt };
};

/** A Wompi transaction in progress for the payment. */
const insertPendingAttempt = async (paymentId: string) =>
  await database.pool.query(
    `insert into payment_attempt (payment_id, provider_transaction_id, status, amount_in_cents, currency)
     values ($1, $2, 'pending', $3, 'COP')`,
    [paymentId, `${unique()}-1610641025-49201`, AMOUNT]
  );

/** Moves the obligation into an agreement with two installments, and returns their ids. */
const seedInstallments = async (obligationId: string) => {
  await database.pool.query(
    "update obligation set status = 'in_agreement' where id = $1",
    [obligationId]
  );
  const agreementId = await queryId(
    "insert into payment_agreement (obligation_id, installment_count) values ($1, 2) returning id",
    [obligationId]
  );
  const ids = [];
  for (const number of [1, 2]) {
    ids.push(
      // oxlint-disable-next-line no-await-in-loop -- Two inserts in order.
      await queryId(
        `insert into installment (payment_agreement_id, obligation_id, number, due_on, amount_in_cents)
         values ($1, $2, $3, '2030-01-01', $4) returning id`,
        [agreementId, obligationId, number, AMOUNT / 2]
      )
    );
  }
  return ids;
};

const paymentsOf = async (obligationId: string) => {
  const result = await database.pool.query<{ id: string; status: string }>(
    "select id, status from payment where obligation_id = $1 order by id",
    [obligationId]
  );
  return result.rows;
};

const obligationStatus = async (obligationId: string) => {
  const result = await database.pool.query<{ status: string }>(
    "select status from obligation where id = $1",
    [obligationId]
  );
  return result.rows.at(0)?.status;
};

describe(createCheckout, () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("starts a pending payment for an obligation of the citizen", async () => {
    const { obligationId, input } = await seedObligation();

    const outcome = await createCheckout(input, withoutWompi());

    expect(outcome).toMatchObject({
      ok: true,
      payment: { amountInCents: AMOUNT },
    });
    await expect(paymentsOf(obligationId)).resolves.toHaveLength(1);
  });

  it("refuses an obligation of another citizen without telling that it exists", async () => {
    const { input } = await seedObligation();
    const other = await seedObligation();

    await expect(
      createCheckout({ ...input, userId: other.input.userId }, withoutWompi())
    ).resolves.toStrictEqual({ ok: false, reason: "obligation_not_found" });
  });

  it("gives the same payment to two checkouts that run at the same time", async () => {
    const { obligationId, input } = await seedObligation();

    const outcomes = await Promise.all([
      createCheckout(input, withoutWompi()),
      createCheckout(input, withoutWompi()),
    ]);

    const ids = outcomes.map((outcome) =>
      outcome.ok ? outcome.payment.id : outcome.reason
    );
    expect(ids[0]).toBe(ids[1]);
    await expect(paymentsOf(obligationId)).resolves.toHaveLength(1);
  });

  it("reconciles the earlier pending payments before it decides", async () => {
    const target = await seedObligation();
    const earlier = await seedPendingPayment(target);
    const reconciled: string[] = [];

    await createCheckout(target.input, withoutWompi(reconciled));

    expect(reconciled).toStrictEqual([earlier.paymentId]);
  });

  it("refuses while an earlier payment has a transaction in progress", async () => {
    const target = await seedObligation();
    const earlier = await seedPendingPayment(target);
    wompiApi.set(earlier.reference, [
      transaction(earlier.reference, "PENDING"),
    ]);

    await expect(
      createCheckout(target.input, withWompi())
    ).resolves.toStrictEqual({ ok: false, reason: "payment_in_progress" });
    await expect(paymentsOf(target.obligationId)).resolves.toHaveLength(1);
  });

  it("refuses when an earlier payment was approved and the webhook was lost", async () => {
    const target = await seedObligation();
    const earlier = await seedPendingPayment(target, {
      createdAt: new Date(Date.now() - CHECKOUT_TTL_MS - 1000),
    });
    wompiApi.set(earlier.reference, [
      transaction(earlier.reference, "APPROVED"),
    ]);

    await expect(
      createCheckout(target.input, withWompi())
    ).resolves.toStrictEqual({ ok: false, reason: "obligation_not_payable" });
    await expect(obligationStatus(target.obligationId)).resolves.toBe("paid");
    await expect(paymentsOf(target.obligationId)).resolves.toMatchObject([
      { id: earlier.paymentId, status: "approved" },
    ]);
  });

  it("refuses when a declined payment was approved on a Wompi retry and the webhook was lost", async () => {
    const target = await seedObligation();
    const earlier = await seedSettledPayment(target, "declined");
    wompiApi.set(earlier.reference, [
      earlier.attempt,
      transaction(earlier.reference, "APPROVED"),
    ]);

    await expect(
      createCheckout(target.input, withWompi())
    ).resolves.toStrictEqual({ ok: false, reason: "obligation_not_payable" });
    await expect(obligationStatus(target.obligationId)).resolves.toBe("paid");
    await expect(paymentsOf(target.obligationId)).resolves.toStrictEqual([
      { id: earlier.paymentId, status: "approved" },
    ]);
  });

  it("does not ask Wompi about a declined payment after the settle window", async () => {
    const target = await seedObligation();
    await seedSettledPayment(target, "declined", {
      createdAt: new Date(Date.now() - SETTLE_WINDOW_MS - 1000),
    });
    const reconciled: string[] = [];

    const outcome = await createCheckout(
      target.input,
      withoutWompi(reconciled)
    );

    expect(outcome).toMatchObject({ ok: true });
    expect(reconciled).toStrictEqual([]);
  });

  it("reconciles the unsettled payments of every target of the obligation", async () => {
    const target = await seedObligation();
    const [first, second] = await seedInstallments(target.obligationId);
    const earlier = await seedPendingPayment(target, { installmentId: first });
    const reconciled: string[] = [];

    await createCheckout(
      { ...target.input, installmentId: second ?? null },
      withoutWompi(reconciled)
    );

    expect(reconciled).toStrictEqual([earlier.paymentId]);
  });

  it("refuses while an approved attempt of the obligation waits for staff", async () => {
    const target = await seedObligation();
    const earlier = await seedSettledPayment(target, "approved");
    // The money is collected, but the target was not payable: staff decide about a refund.
    await database.pool.query(
      "update payment_attempt set review_reason = 'target_not_payable' where payment_id = $1",
      [earlier.paymentId]
    );

    await expect(
      createCheckout(target.input, withoutWompi())
    ).resolves.toStrictEqual({ ok: false, reason: "payment_under_review" });
    await expect(paymentsOf(target.obligationId)).resolves.toHaveLength(1);
  });

  it("refuses while a payment of another target of the obligation has a transaction in progress", async () => {
    const target = await seedObligation();
    const [first, second] = await seedInstallments(target.obligationId);
    const earlier = await seedPendingPayment(target, { installmentId: first });
    await insertPendingAttempt(earlier.paymentId);

    await expect(
      createCheckout(
        { ...target.input, installmentId: second ?? null },
        withoutWompi()
      )
    ).resolves.toStrictEqual({ ok: false, reason: "payment_in_progress" });
    await expect(paymentsOf(target.obligationId)).resolves.toHaveLength(1);
  });

  it("refuses until an open link for a different amount expires", async () => {
    const target = await seedObligation();
    const createdAt = new Date();
    await seedPendingPayment(target, { amountInCents: 3_000_000, createdAt });

    await expect(
      createCheckout(target.input, withoutWompi())
    ).resolves.toStrictEqual({
      ok: false,
      reason: "other_amount_open",
      until: new Date(createdAt.getTime() + CHECKOUT_TTL_MS),
    });
  });

  it("starts a new payment when the earlier link expired without a transaction", async () => {
    const target = await seedObligation();
    const earlier = await seedPendingPayment(target, {
      createdAt: new Date(Date.now() - CHECKOUT_TTL_MS - 1000),
    });
    wompiApi.set(earlier.reference, []);

    const outcome = await createCheckout(target.input, withWompi());

    expect(outcome).toMatchObject({ ok: true });
    await expect(paymentsOf(target.obligationId)).resolves.toMatchObject([
      { id: earlier.paymentId, status: "expired" },
      { status: "pending" },
    ]);
  });

  it("refuses when Wompi cannot tell the status of an earlier payment", async () => {
    const target = await seedObligation();
    const earlier = await seedPendingPayment(target);
    wompiApi.delete(earlier.reference);

    await expect(
      createCheckout(target.input, withWompi())
    ).resolves.toStrictEqual({
      ok: false,
      reason: "earlier_payment_unavailable",
    });
    await expect(paymentsOf(target.obligationId)).resolves.toHaveLength(1);
  });
});
