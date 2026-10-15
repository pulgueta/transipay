import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { listObligations, readObligation } from "./read";

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

const seedUser = async () =>
  await queryId(
    `insert into auth."user" (name, email, role) values ('Ana', $1, 'citizen') returning id`,
    [`${unique()}@example.com`]
  );

const seedEntity = async (kind = "transit_authority") =>
  await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ($1, 'ITTB', $2, 'entity@example.com', '3000000000') returning id`,
    [kind, unique()]
  );

const seedCitizen = async (userId: string | null) =>
  await queryId(
    `insert into citizen (user_id, document_type, document_number, first_name, last_name)
     values ($1, 'CC', $2, 'Ana', 'Rojas') returning id`,
    [userId, unique().toUpperCase()]
  );

const seedFine = async (input: {
  citizenId: string;
  entityId: string;
  amountInCents?: number;
  dueOn?: string | null;
  status?: string;
}) => {
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents, due_on, status)
     values ($1, $2, 'fine', $3, $4, $5, $6) returning id`,
    [
      input.citizenId,
      input.entityId,
      unique(),
      input.amountInCents ?? 100_000,
      input.dueOn ?? null,
      input.status ?? "pending",
    ]
  );
  const infractionId = await queryId(
    `insert into infraction (code, description, amount_in_cents) values ($1, 'Parked in a no-parking zone', 100000) returning id`,
    [unique()]
  );
  await database.pool.query(
    `insert into fine (obligation_id, infraction_id, location, occurred_at)
     values ($1, $2, 'Calle 50', now())`,
    [obligationId, infractionId]
  );
  return obligationId;
};

const seedProcedure = async (citizenId: string, entityId: string) => {
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents)
     values ($1, $2, 'procedure', $3, 50000) returning id`,
    [citizenId, entityId, unique()]
  );
  const procedureTypeId = await queryId(
    `insert into procedure_type (entity_id, code, name, amount_in_cents)
     values ($1, $2, 'License renewal', 50000) returning id`,
    [entityId, unique()]
  );
  await database.pool.query(
    `insert into procedure (obligation_id, entity_id, procedure_type_id) values ($1, $2, $3)`,
    [obligationId, entityId, procedureTypeId]
  );
  return obligationId;
};

const seedAgreement = async (obligationId: string) => {
  await database.pool.query(
    "update obligation set status = 'in_agreement' where id = $1",
    [obligationId]
  );
  const agreementId = await queryId(
    "insert into payment_agreement (obligation_id, installment_count) values ($1, 2) returning id",
    [obligationId]
  );
  await database.pool.query(
    `insert into installment (payment_agreement_id, obligation_id, number, due_on, amount_in_cents, status)
     values ($1, $2, 1, '2030-01-01', 40000, 'paid'), ($1, $2, 2, '2030-02-01', 60000, 'pending')`,
    [agreementId, obligationId]
  );
};

const seedScene = async () => {
  const userId = await seedUser();
  const entityId = await seedEntity();
  const citizenId = await seedCitizen(userId);
  return { userId, entityId, citizenId };
};

describe("obligations", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  describe(listObligations, () => {
    it("tells when the user has no citizen record", async () => {
      const userId = await seedUser();

      await expect(
        listObligations(appDatabase, { userId, limit: 20 })
      ).resolves.toStrictEqual({
        hasCitizen: false,
        items: [],
        nextCursor: null,
      });
    });

    it("lists only the obligations of the citizen, newest first, with the keyset", async () => {
      const { userId, entityId, citizenId } = await seedScene();
      const other = await seedScene();
      const first = await seedFine({ citizenId, entityId });
      const second = await seedFine({ citizenId, entityId });
      await seedFine({ citizenId: other.citizenId, entityId: other.entityId });

      const page = await listObligations(appDatabase, { userId, limit: 1 });
      expect(page.hasCitizen).toBeTruthy();
      expect(page.items.map((item) => item.id)).toStrictEqual([second]);
      expect(page.nextCursor).toBe(second);

      const next = await listObligations(appDatabase, {
        userId,
        limit: 1,
        cursor: page.nextCursor ?? undefined,
      });
      expect(next.items.map((item) => item.id)).toStrictEqual([first]);
      expect(next.nextCursor).toBeNull();
    });

    it("describes a fine and a procedure, and resolves the amount due and the state", async () => {
      const { userId, entityId, citizenId } = await seedScene();
      await seedFine({ citizenId, entityId, dueOn: "2020-01-01" });
      await seedProcedure(citizenId, entityId);

      const page = await listObligations(appDatabase, { userId, limit: 20 });

      expect(page.items).toMatchObject([
        {
          kind: "procedure",
          description: "License renewal",
          entityName: "ITTB",
          amountDueInCents: 50_000,
          state: "pending",
          agreement: null,
        },
        {
          kind: "fine",
          amountDueInCents: 100_000,
          state: "overdue",
        },
      ]);
      expect(
        page.items[1]?.description.endsWith("Parked in a no-parking zone")
      ).toBeTruthy();
    });

    it("sums the unpaid installments of an active agreement", async () => {
      const { userId, entityId, citizenId } = await seedScene();
      await seedAgreement(await seedFine({ citizenId, entityId }));

      const page = await listObligations(appDatabase, { userId, limit: 20 });

      expect(page.items).toMatchObject([
        {
          state: "in_agreement",
          amountDueInCents: 60_000,
          agreement: { installmentCount: 2, paidCount: 1 },
        },
      ]);
    });
  });

  describe(readObligation, () => {
    it("returns the installments and the payments of the obligation", async () => {
      const { userId, entityId, citizenId } = await seedScene();
      const obligationId = await seedFine({ citizenId, entityId });
      await seedAgreement(obligationId);
      await database.pool.query(
        `insert into payment (citizen_id, obligation_id, amount_in_cents, reference) values ($1, $2, 40000, $3)`,
        [citizenId, obligationId, `tp_${unique()}`]
      );

      const result = await readObligation(appDatabase, {
        userId,
        obligationId,
      });

      expect(result).toMatchObject({
        id: obligationId,
        state: "in_agreement",
        installments: [
          { number: 1, amountInCents: 40_000, status: "paid" },
          { number: 2, amountInCents: 60_000, status: "pending" },
        ],
        payments: [{ amountInCents: 40_000, status: "pending" }],
      });
    });

    it("gives null for an obligation of another citizen", async () => {
      const { entityId, citizenId } = await seedScene();
      const other = await seedScene();
      const obligationId = await seedFine({ citizenId, entityId });

      await expect(
        readObligation(appDatabase, { userId: other.userId, obligationId })
      ).resolves.toBeNull();
    });
  });
});
