import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { createFine, createProcedure } from "./staff-create";

const FINE_AMOUNT = 5_600_000;
const PROCEDURE_AMOUNT = 120_000;

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

const seedEntity = async (kind = "transit_authority") =>
  await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ($1, 'Entity', $2, 'entity@example.com', '3000000000') returning id`,
    [kind, unique()]
  );

const seedWorld = async () => {
  const actorId = await queryId(
    `insert into auth."user" (name, email, role) values ('Staff', $1, 'supervisor') returning id`,
    [`${unique()}@example.com`]
  );
  const entityId = await seedEntity();
  const citizenId = await queryId(
    `insert into citizen (document_type, document_number, first_name, last_name)
     values ('CC', $1, 'Ana', 'Rojas') returning id`,
    [unique().toUpperCase()]
  );
  const infractionId = await queryId(
    `insert into infraction (code, description, amount_in_cents) values ($1, 'Speeding', $2) returning id`,
    [unique(), FINE_AMOUNT]
  );
  const procedureTypeId = await queryId(
    `insert into procedure_type (entity_id, code, name, amount_in_cents) values ($1, $2, 'License renewal', $3) returning id`,
    [entityId, unique(), PROCEDURE_AMOUNT]
  );
  return { actorId, entityId, citizenId, infractionId, procedureTypeId };
};

const auditActors = async (tableName: string, recordId: string) => {
  const result = await database.pool.query<{ actor_user_id: string | null }>(
    "select actor_user_id from audit_log where table_name = $1 and record_id = $2 and action = 'insert'",
    [tableName, recordId]
  );
  return result.rows.map((row) => row.actor_user_id);
};

const fineInput = (world: Awaited<ReturnType<typeof seedWorld>>) => ({
  actorId: world.actorId,
  citizenId: world.citizenId,
  entityId: world.entityId,
  infractionId: world.infractionId,
  number: `F-${unique()}`,
  location: "Calle 50 con carrera 20",
  occurredAt: new Date("2026-10-10T14:30:00-05:00"),
  dueOn: "2026-11-10",
  plate: null,
  agentCode: "A-17",
  scope: { kind: "all" } as const,
});

describe("staff obligations", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("creates a fine with the infraction amount and records the actor on both rows", async () => {
    const world = await seedWorld();
    const input = fineInput(world);

    const outcome = await createFine(appDatabase, input);

    expect(outcome.ok).toBeTruthy();
    if (!outcome.ok) {
      return;
    }
    expect(outcome.obligation).toMatchObject({
      number: input.number,
      kind: "fine",
      status: "pending",
      amountInCents: FINE_AMOUNT,
      dueOn: "2026-11-10",
    });
    const fine = await database.pool.query<{
      infraction_id: string;
      location: string;
      agent_code: string;
    }>(
      "select infraction_id, location, agent_code from fine where obligation_id = $1",
      [outcome.obligation.id]
    );
    expect(fine.rows).toStrictEqual([
      {
        infraction_id: world.infractionId,
        location: input.location,
        agent_code: "A-17",
      },
    ]);
    await expect(
      auditActors("obligation", outcome.obligation.id)
    ).resolves.toStrictEqual([world.actorId]);
    await expect(
      auditActors("fine", outcome.obligation.id)
    ).resolves.toStrictEqual([world.actorId]);
  });

  it("links the fine to the vehicle with the plate, and refuses an unknown plate", async () => {
    const world = await seedWorld();
    const vehicleId = await queryId(
      `insert into vehicle (owner_id, plate, vehicle_type, service_type, brand, line, model_year)
       values ($1, $2, 'car', 'private', 'Renault', 'Logan', 2019) returning id`,
      [world.citizenId, `ABC${unique().slice(0, 3).toUpperCase()}`]
    );
    const plate = await database.pool.query<{ plate: string }>(
      "select plate from vehicle where id = $1",
      [vehicleId]
    );

    const linked = await createFine(appDatabase, {
      ...fineInput(world),
      plate: plate.rows[0]?.plate.toLowerCase() ?? "",
    });
    expect(linked.ok).toBeTruthy();
    const fine = await database.pool.query<{ vehicle_id: string }>(
      "select vehicle_id from fine where obligation_id = $1",
      [linked.ok ? linked.obligation.id : ""]
    );
    expect(fine.rows).toStrictEqual([{ vehicle_id: vehicleId }]);

    await expect(
      createFine(appDatabase, { ...fineInput(world), plate: "ZZZ999" })
    ).resolves.toStrictEqual({ ok: false, reason: "vehicle_not_found" });
  });

  it("refuses a fine for an entity that is not the transit authority, or a used number", async () => {
    const world = await seedWorld();
    const cdaId = await seedEntity("cda");

    await expect(
      createFine(appDatabase, { ...fineInput(world), entityId: cdaId })
    ).resolves.toStrictEqual({
      ok: false,
      reason: "entity_not_transit_authority",
    });

    const input = fineInput(world);
    await createFine(appDatabase, input);
    await expect(createFine(appDatabase, input)).resolves.toStrictEqual({
      ok: false,
      reason: "number_in_use",
    });
  });

  it("creates a procedure with the amount of its type, and refuses a type of another entity", async () => {
    const world = await seedWorld();
    const number = `P-${unique()}`;

    const outcome = await createProcedure(appDatabase, {
      actorId: world.actorId,
      citizenId: world.citizenId,
      entityId: world.entityId,
      procedureTypeId: world.procedureTypeId,
      number,
      dueOn: null,
      plate: null,
      scope: { kind: "all" },
    });

    expect(outcome.ok).toBeTruthy();
    if (!outcome.ok) {
      return;
    }
    expect(outcome.obligation).toMatchObject({
      number,
      kind: "procedure",
      status: "pending",
      amountInCents: PROCEDURE_AMOUNT,
      dueOn: null,
    });
    const procedure = await database.pool.query<{
      procedure_type_id: string;
      entity_id: string;
    }>(
      "select procedure_type_id, entity_id from procedure where obligation_id = $1",
      [outcome.obligation.id]
    );
    expect(procedure.rows).toStrictEqual([
      { procedure_type_id: world.procedureTypeId, entity_id: world.entityId },
    ]);
    await expect(
      auditActors("procedure", outcome.obligation.id)
    ).resolves.toStrictEqual([world.actorId]);

    const otherEntityId = await seedEntity("cda");
    await expect(
      createProcedure(appDatabase, {
        actorId: world.actorId,
        citizenId: world.citizenId,
        entityId: otherEntityId,
        procedureTypeId: world.procedureTypeId,
        number: `P-${unique()}`,
        dueOn: null,
        plate: null,
        scope: { kind: "all" },
      })
    ).resolves.toStrictEqual({ ok: false, reason: "procedure_type_not_found" });
  });

  it("refuses a fine or a procedure for an entity outside the staff scope", async () => {
    const world = await seedWorld();
    const ownEntityId = await seedEntity();
    const scope = { kind: "entities" as const, entityIds: [ownEntityId] };

    await expect(
      createFine(appDatabase, { ...fineInput(world), scope })
    ).resolves.toStrictEqual({ ok: false, reason: "entity_not_in_scope" });
    await expect(
      createProcedure(appDatabase, {
        actorId: world.actorId,
        citizenId: world.citizenId,
        entityId: world.entityId,
        procedureTypeId: world.procedureTypeId,
        number: `P-${unique()}`,
        dueOn: null,
        plate: null,
        scope,
      })
    ).resolves.toStrictEqual({ ok: false, reason: "entity_not_in_scope" });
    const stored = await database.pool.query(
      "select id from obligation where entity_id = $1",
      [world.entityId]
    );
    expect(stored.rows).toStrictEqual([]);
  });

  it("creates a fine for an entity in the staff scope", async () => {
    const world = await seedWorld();
    const outcome = await createFine(appDatabase, {
      ...fineInput(world),
      scope: { kind: "entities", entityIds: [world.entityId] },
    });

    expect(outcome.ok).toBeTruthy();
  });
});
