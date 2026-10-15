import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { listSessionEnrollments, recordAttendance } from "./staff-attendance";

const FINE_AMOUNT = 333_333;
const DISCOUNT_PERCENT = 50;

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

/** `startsIn` is a Postgres interval from now. The default session started three hours ago and ended one hour ago. */
const seedWorld = async (
  options: {
    startsIn?: string;
    fineStatus?: string;
    discount?: number;
    percent?: number;
  } = {}
) => {
  const actorId = await queryId(
    `insert into auth."user" (name, email, role) values ('Staff', $1, 'scheduler') returning id`,
    [`${unique()}@example.com`]
  );
  const ceaId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ('cea', 'CEA', $1, 'cea@example.com', '3000000000') returning id`,
    [unique()]
  );
  const branchId = await queryId(
    `insert into branch (entity_id, name, address) values ($1, $2, 'Calle 1') returning id`,
    [ceaId, `Branch ${unique()}`]
  );
  const sessionId = await queryId(
    `insert into course_session (entity_id, branch_id, starts_at, ends_at, capacity, discount_percent)
     values ($1, $2, now() + $3::interval, now() + $3::interval + interval '2 hours', 10, $4) returning id`,
    [
      ceaId,
      branchId,
      options.startsIn ?? "-3 hours",
      options.percent ?? DISCOUNT_PERCENT,
    ]
  );
  const ittbId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ('transit_authority', 'ITTB', $1, 'ittb@example.com', '3000000000') returning id`,
    [unique()]
  );
  const citizenId = await queryId(
    `insert into citizen (document_type, document_number, first_name, last_name)
     values ('CC', $1, 'Ana', 'Rojas') returning id`,
    [unique().toUpperCase()]
  );
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents, status, discount_in_cents)
     values ($1, $2, 'fine', $3, $4, $5, $6) returning id`,
    [
      citizenId,
      ittbId,
      `F-${unique()}`,
      FINE_AMOUNT,
      options.fineStatus ?? "pending",
      options.discount ?? 0,
    ]
  );
  const enrollmentId = await queryId(
    `insert into course_enrollment (course_session_id, citizen_id, obligation_id)
     values ($1, $2, $3) returning id`,
    [sessionId, citizenId, obligationId]
  );
  return { actorId, ceaId, sessionId, obligationId, enrollmentId };
};

type World = Awaited<ReturnType<typeof seedWorld>>;

const scopeOf = (world: World) => ({
  kind: "entities" as const,
  entityIds: [world.ceaId],
});

const discountOf = async (obligationId: string) => {
  const result = await database.pool.query<{ discount_in_cents: string }>(
    "select discount_in_cents from obligation where id = $1",
    [obligationId]
  );
  return Number(result.rows.at(0)?.discount_in_cents);
};

const auditActors = async (tableName: string, recordId: string) => {
  const result = await database.pool.query<{ actor_user_id: string | null }>(
    "select actor_user_id from audit_log where table_name = $1 and record_id = $2 and action = 'update'",
    [tableName, recordId]
  );
  return result.rows.map((row) => row.actor_user_id);
};

describe("course attendance", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("records the attendance, applies the discount, and records the actor", async () => {
    const world = await seedWorld();
    const input = {
      actorId: world.actorId,
      enrollmentId: world.enrollmentId,
      outcome: "attended" as const,
      scope: scopeOf(world),
    };

    const outcome = await recordAttendance(appDatabase, input);

    // 50 percent of 333,333 is 166,666.5. It rounds to 166,667.
    expect(outcome).toMatchObject({
      ok: true,
      enrollment: { id: world.enrollmentId, status: "attended" },
      obligation: { id: world.obligationId, discountInCents: 166_667 },
    });
    expect(outcome.ok ? outcome.enrollment.attendedAt : null).toBeInstanceOf(
      Date
    );
    await expect(
      auditActors("course_enrollment", world.enrollmentId)
    ).resolves.toStrictEqual([world.actorId]);
    await expect(
      auditActors("obligation", world.obligationId)
    ).resolves.toStrictEqual([world.actorId]);
  });

  it("refuses a second result, so the discount applies one time only", async () => {
    const world = await seedWorld();
    const input = {
      actorId: world.actorId,
      enrollmentId: world.enrollmentId,
      outcome: "attended" as const,
      scope: scopeOf(world),
    };
    await recordAttendance(appDatabase, input);

    await expect(recordAttendance(appDatabase, input)).resolves.toStrictEqual({
      ok: false,
      reason: "not_enrolled",
    });
    await expect(
      recordAttendance(appDatabase, { ...input, outcome: "absent" })
    ).resolves.toStrictEqual({ ok: false, reason: "not_enrolled" });
    await expect(discountOf(world.obligationId)).resolves.toBe(166_667);
  });

  it("records an absence with no discount", async () => {
    const world = await seedWorld();

    const outcome = await recordAttendance(appDatabase, {
      actorId: world.actorId,
      enrollmentId: world.enrollmentId,
      outcome: "absent",
      scope: scopeOf(world),
    });

    expect(outcome).toMatchObject({
      ok: true,
      enrollment: { status: "absent", attendedAt: null },
      obligation: { discountInCents: 0 },
    });
    await expect(discountOf(world.obligationId)).resolves.toBe(0);
  });

  it("does not change a fine that is not pending or that has a discount", async () => {
    const paid = await seedWorld({ fineStatus: "paid" });
    const discounted = await seedWorld({ discount: 1000 });

    for (const world of [paid, discounted]) {
      // oxlint-disable-next-line no-await-in-loop -- The worlds are independent. The order does not matter.
      const outcome = await recordAttendance(appDatabase, {
        actorId: world.actorId,
        enrollmentId: world.enrollmentId,
        outcome: "attended",
        scope: scopeOf(world),
      });
      expect(outcome).toMatchObject({
        ok: true,
        enrollment: { status: "attended" },
      });
    }
    await expect(discountOf(paid.obligationId)).resolves.toBe(0);
    await expect(discountOf(discounted.obligationId)).resolves.toBe(1000);
  });

  it("refuses a session that did not end and an enrollment outside the scope", async () => {
    const future = await seedWorld({ startsIn: "1 day" });
    const inProgress = await seedWorld({ startsIn: "-1 hour" });
    const other = await seedWorld();

    await expect(
      recordAttendance(appDatabase, {
        actorId: future.actorId,
        enrollmentId: future.enrollmentId,
        outcome: "attended",
        scope: scopeOf(future),
      })
    ).resolves.toStrictEqual({ ok: false, reason: "not_ended" });
    for (const outcome of ["attended", "absent"] as const) {
      // oxlint-disable-next-line no-await-in-loop -- Each call reads the same row. The order does not matter.
      await expect(
        recordAttendance(appDatabase, {
          actorId: inProgress.actorId,
          enrollmentId: inProgress.enrollmentId,
          outcome,
          scope: scopeOf(inProgress),
        })
      ).resolves.toStrictEqual({ ok: false, reason: "not_ended" });
    }
    await expect(discountOf(inProgress.obligationId)).resolves.toBe(0);
    await expect(
      recordAttendance(appDatabase, {
        actorId: future.actorId,
        enrollmentId: other.enrollmentId,
        outcome: "attended",
        scope: scopeOf(future),
      })
    ).resolves.toStrictEqual({ ok: false, reason: "enrollment_not_found" });
    await expect(discountOf(future.obligationId)).resolves.toBe(0);
    await expect(discountOf(other.obligationId)).resolves.toBe(0);
  });

  it("refuses an attendance that makes the fine free, and keeps the enrollment", async () => {
    const world = await seedWorld({ percent: 100 });
    const input = {
      actorId: world.actorId,
      enrollmentId: world.enrollmentId,
      outcome: "attended" as const,
      scope: scopeOf(world),
    };

    await expect(recordAttendance(appDatabase, input)).resolves.toStrictEqual({
      ok: false,
      reason: "full_discount_not_supported",
    });
    await expect(discountOf(world.obligationId)).resolves.toBe(0);
    await expect(
      recordAttendance(appDatabase, { ...input, outcome: "absent" })
    ).resolves.toMatchObject({ ok: true, enrollment: { status: "absent" } });
  });

  it("lists the enrollments of a session in the scope only", async () => {
    const world = await seedWorld();
    const other = await seedWorld();

    await expect(
      listSessionEnrollments(appDatabase, {
        courseSessionId: world.sessionId,
        scope: scopeOf(world),
      })
    ).resolves.toMatchObject([
      {
        id: world.enrollmentId,
        status: "enrolled",
        citizenName: "Ana Rojas",
      },
    ]);
    await expect(
      listSessionEnrollments(appDatabase, {
        courseSessionId: other.sessionId,
        scope: scopeOf(world),
      })
    ).resolves.toBeNull();
  });
});
