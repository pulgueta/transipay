import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { listStaffAppointments, updateAppointmentStatus } from "./staff-update";

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

/** `scheduledIn` is a Postgres interval from now. The default appointment started one hour ago. */
const seedWorld = async (scheduledIn = "-1 hour") => {
  const actorId = await queryId(
    `insert into auth."user" (name, email, role) values ('Staff', $1, 'scheduler') returning id`,
    [`${unique()}@example.com`]
  );
  const entityId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ('cda', 'CDA', $1, 'cda@example.com', '3000000000') returning id`,
    [unique()]
  );
  const branchId = await queryId(
    `insert into branch (entity_id, name, address) values ($1, $2, 'Calle 1') returning id`,
    [entityId, `Branch ${unique()}`]
  );
  const procedureTypeId = await queryId(
    `insert into procedure_type (entity_id, code, name, amount_in_cents, requires_appointment)
     values ($1, $2, 'Inspection', 90000, true) returning id`,
    [entityId, unique()]
  );
  const citizenId = await queryId(
    `insert into citizen (document_type, document_number, first_name, last_name)
     values ('CC', $1, 'Ana', 'Rojas') returning id`,
    [unique()]
  );
  const appointmentId = await queryId(
    `insert into appointment (citizen_id, entity_id, branch_id, procedure_type_id, scheduled_at)
     values ($1, $2, $3, $4, now() + $5::interval) returning id`,
    [citizenId, entityId, branchId, procedureTypeId, scheduledIn]
  );
  return {
    actorId,
    entityId,
    branchId,
    procedureTypeId,
    citizenId,
    appointmentId,
  };
};

const auditActors = async (recordId: string, action: string) => {
  const result = await database.pool.query<{ actor_user_id: string | null }>(
    "select actor_user_id from audit_log where table_name = 'appointment' and record_id = $1 and action = $2",
    [recordId, action]
  );
  return result.rows.map((row) => row.actor_user_id);
};

const appointmentState = async (id: string) => {
  const row = await database.pool.query<{ status: string }>(
    "select status from appointment where id = $1",
    [id]
  );
  return row.rows.at(0)?.status;
};

describe("staff appointments", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("marks a scheduled appointment as attended and records the actor", async () => {
    const world = await seedWorld();

    const outcome = await updateAppointmentStatus(appDatabase, {
      actorId: world.actorId,
      appointmentId: world.appointmentId,
      status: "attended",
      scope: { kind: "entities", entityIds: [world.entityId] },
    });

    expect(outcome.ok).toBeTruthy();
    expect(outcome.ok ? outcome.appointment : null).toMatchObject({
      id: world.appointmentId,
      status: "attended",
    });
    await expect(appointmentState(world.appointmentId)).resolves.toBe(
      "attended"
    );
    await expect(
      auditActors(world.appointmentId, "update")
    ).resolves.toStrictEqual([world.actorId]);
  });

  it("refuses a second change, an appointment of another entity, and an unknown id", async () => {
    const world = await seedWorld();
    const other = await seedWorld();
    await updateAppointmentStatus(appDatabase, {
      actorId: world.actorId,
      appointmentId: world.appointmentId,
      status: "no_show",
      scope: { kind: "all" },
    });

    await expect(
      updateAppointmentStatus(appDatabase, {
        actorId: world.actorId,
        appointmentId: world.appointmentId,
        status: "attended",
        scope: { kind: "all" },
      })
    ).resolves.toStrictEqual({ ok: false, reason: "not_allowed" });
    await expect(
      updateAppointmentStatus(appDatabase, {
        actorId: world.actorId,
        appointmentId: other.appointmentId,
        status: "attended",
        scope: { kind: "entities", entityIds: [world.entityId] },
      })
    ).resolves.toStrictEqual({ ok: false, reason: "appointment_not_found" });
    await expect(
      updateAppointmentStatus(appDatabase, {
        actorId: world.actorId,
        appointmentId: randomUUID(),
        status: "attended",
        scope: { kind: "all" },
      })
    ).resolves.toStrictEqual({ ok: false, reason: "appointment_not_found" });
    await expect(appointmentState(other.appointmentId)).resolves.toBe(
      "scheduled"
    );
  });

  it("refuses to close an appointment that did not start", async () => {
    const world = await seedWorld("1 day");

    for (const status of ["attended", "no_show"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- The two calls run one after the other on purpose.
      await expect(
        updateAppointmentStatus(appDatabase, {
          actorId: world.actorId,
          appointmentId: world.appointmentId,
          status,
          scope: { kind: "all" },
        })
      ).resolves.toStrictEqual({ ok: false, reason: "not_started" });
    }
    await expect(appointmentState(world.appointmentId)).resolves.toBe(
      "scheduled"
    );
  });

  it("lists the scheduled appointments of the scope only, with the citizen and the branch", async () => {
    const mine = await seedWorld();
    const other = await seedWorld();

    const page = await listStaffAppointments(appDatabase, {
      scope: { kind: "entities", entityIds: [mine.entityId] },
      limit: 100,
    });
    const ids = page.items.map((item) => item.id);

    expect(ids).toContain(mine.appointmentId);
    expect(ids).not.toContain(other.appointmentId);
    expect(
      page.items.find((item) => item.id === mine.appointmentId)
    ).toMatchObject({
      status: "scheduled",
      citizenName: "Ana Rojas",
      procedureName: "Inspection",
    });
  });
});
