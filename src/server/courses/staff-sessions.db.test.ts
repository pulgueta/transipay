import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { createCourseSession, listCourseSessions } from "./staff-sessions";

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

const seedWorld = async (kind = "cea", isActive = true) => {
  const actorId = await queryId(
    `insert into auth."user" (name, email, role) values ('Staff', $1, 'scheduler') returning id`,
    [`${unique()}@example.com`]
  );
  const entityId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone, is_active)
     values ($1, 'CEA', $2, 'cea@example.com', '3000000000', $3) returning id`,
    [kind, unique(), isActive]
  );
  const branchId = await queryId(
    `insert into branch (entity_id, name, address) values ($1, $2, 'Calle 1') returning id`,
    [entityId, `Branch ${unique()}`]
  );
  return { actorId, entityId, branchId };
};

const sessionInput = (world: Awaited<ReturnType<typeof seedWorld>>) => ({
  actorId: world.actorId,
  entityId: world.entityId,
  branchId: world.branchId,
  startsAt: new Date("2026-11-02T13:00:00Z"),
  endsAt: new Date("2026-11-02T17:00:00Z"),
  capacity: 20,
  discountPercent: 50,
  scope: { kind: "entities" as const, entityIds: [world.entityId] },
});

/** A fine of a new citizen, enrolled in the session with the status. */
const seedEnrollment = async (
  world: Awaited<ReturnType<typeof seedWorld>>,
  courseSessionId: string,
  status: string
) => {
  const ittbId = await queryId(
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
     values ($1, $2, 'fine', $3, 1000000) returning id`,
    [citizenId, ittbId, `F-${unique()}`]
  );
  await database.pool.query(
    `insert into course_enrollment (course_session_id, citizen_id, obligation_id, status, attended_at)
     values ($1, $2, $3, $4, $5)`,
    [
      courseSessionId,
      citizenId,
      obligationId,
      status,
      status === "attended" ? new Date() : null,
    ]
  );
  void world;
};

describe("staff course sessions", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  // The course_session table has no audit trigger (see drizzle/0001_audit_trigger.sql), so there is no actor check.
  it("creates a session at a branch of the entity", async () => {
    const world = await seedWorld();

    const outcome = await createCourseSession(appDatabase, sessionInput(world));

    expect(outcome.ok).toBeTruthy();
    expect(outcome.ok ? outcome.session : null).toMatchObject({
      entityId: world.entityId,
      branchId: world.branchId,
      capacity: 20,
      discountPercent: 50,
    });
    const stored = await database.pool.query<{ capacity: number }>(
      "select capacity from course_session where id = $1",
      [outcome.ok ? outcome.session.id : ""]
    );
    expect(stored.rows).toStrictEqual([{ capacity: 20 }]);
  });

  it("refuses a branch of another entity, an entity outside the scope, and an end before the start", async () => {
    const world = await seedWorld();
    const other = await seedWorld();

    await expect(
      createCourseSession(appDatabase, {
        ...sessionInput(world),
        branchId: other.branchId,
      })
    ).resolves.toStrictEqual({ ok: false, reason: "branch_not_found" });
    await expect(
      createCourseSession(appDatabase, {
        ...sessionInput(world),
        scope: { kind: "entities", entityIds: [other.entityId] },
      })
    ).resolves.toStrictEqual({ ok: false, reason: "entity_not_in_scope" });
    await expect(
      createCourseSession(appDatabase, {
        ...sessionInput(world),
        endsAt: new Date("2026-11-02T12:00:00Z"),
      })
    ).resolves.toStrictEqual({ ok: false, reason: "ends_before_start" });
  });

  it("refuses an entity that does not give courses or is not active", async () => {
    const cda = await seedWorld("cda");
    const closed = await seedWorld("cea", false);

    await expect(
      createCourseSession(appDatabase, sessionInput(cda))
    ).resolves.toStrictEqual({
      ok: false,
      reason: "entity_cannot_give_courses",
    });
    await expect(
      createCourseSession(appDatabase, sessionInput(closed))
    ).resolves.toStrictEqual({ ok: false, reason: "entity_inactive" });
  });

  it("creates a session for the transit authority", async () => {
    const ittb = await seedWorld("transit_authority");

    const outcome = await createCourseSession(appDatabase, sessionInput(ittb));

    expect(outcome.ok).toBeTruthy();
  });

  it("lists the sessions of the scope with the count of live enrollments", async () => {
    const world = await seedWorld();
    const other = await seedWorld();
    const created = await createCourseSession(appDatabase, sessionInput(world));
    const foreign = await createCourseSession(appDatabase, {
      ...sessionInput(other),
      scope: { kind: "all" },
    });
    if (!(created.ok && foreign.ok)) {
      throw new Error("The sessions were not created.");
    }
    await seedEnrollment(world, created.session.id, "enrolled");
    await seedEnrollment(world, created.session.id, "attended");
    await seedEnrollment(world, created.session.id, "cancelled");

    const page = await listCourseSessions(appDatabase, {
      scope: { kind: "entities", entityIds: [world.entityId] },
      limit: 100,
    });
    const ids = page.items.map((item) => item.id);

    expect(ids).toContain(created.session.id);
    expect(ids).not.toContain(foreign.session.id);
    expect(
      page.items.find((item) => item.id === created.session.id)
    ).toMatchObject({
      enrolledCount: 2,
      capacity: 20,
      entityName: "CEA",
    });
  });
});
