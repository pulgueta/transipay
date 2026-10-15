import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { cancelEnrollment, enrollInCourse, listCourses } from "./courses";

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

const seedCitizen = async (userId: string) =>
  await queryId(
    `insert into citizen (user_id, document_type, document_number, first_name, last_name)
     values ($1, 'CC', $2, 'Ana', 'Rojas') returning id`,
    [userId, unique().toUpperCase()]
  );

const seedEntity = async (kind = "cea") =>
  await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ($1, $2, $3, 'entity@example.com', '3000000000') returning id`,
    [kind, `CEA ${unique()}`, unique()]
  );

const seedSession = async (
  options: { capacity?: number; startsAt?: string } = {}
) => {
  const entityId = await seedEntity();
  const branchId = await queryId(
    `insert into branch (entity_id, name, address) values ($1, $2, 'Street 1') returning id`,
    [entityId, unique()]
  );
  const startsAt = options.startsAt ?? "2030-01-01T15:00:00Z";
  return await queryId(
    `insert into course_session (entity_id, branch_id, starts_at, ends_at, capacity, discount_percent)
     values ($1, $2, $3, $3::timestamptz + interval '2 hours', $4, 50) returning id`,
    [entityId, branchId, startsAt, options.capacity ?? 10]
  );
};

const seedFine = async (citizenId: string, status = "pending") => {
  const entityId = await seedEntity("transit_authority");
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents, status)
     values ($1, $2, 'fine', $3, 100000, $4) returning id`,
    [citizenId, entityId, unique(), status]
  );
  const infractionId = await queryId(
    `insert into infraction (code, description, amount_in_cents) values ($1, 'Speeding', 100000) returning id`,
    [unique()]
  );
  await database.pool.query(
    `insert into fine (obligation_id, infraction_id, location, occurred_at) values ($1, $2, 'Calle 50', now())`,
    [obligationId, infractionId]
  );
  return obligationId;
};

const seedScene = async () => {
  const userId = await seedUser();
  const citizenId = await seedCitizen(userId);
  const fineId = await seedFine(citizenId);
  return { userId, citizenId, fineId };
};

const enroll = async (
  userId: string,
  courseSessionId: string,
  obligationId: string
) =>
  await enrollInCourse(appDatabase, {
    userId,
    actorId: userId,
    courseSessionId,
    obligationId,
  });

describe("courses", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  describe(enrollInCourse, () => {
    it("enrolls the citizen with a pending fine and returns the stored enrollment", async () => {
      const { userId, fineId } = await seedScene();
      const sessionId = await seedSession();

      const outcome = await enroll(userId, sessionId, fineId);

      expect(outcome).toMatchObject({
        ok: true,
        enrollment: { courseSessionId: sessionId, status: "enrolled" },
      });
    });

    it("refuses a fine of another citizen", async () => {
      const { userId } = await seedScene();
      const other = await seedScene();
      const sessionId = await seedSession();

      await expect(
        enroll(userId, sessionId, other.fineId)
      ).resolves.toStrictEqual({
        ok: false,
        reason: "obligation_not_eligible",
      });
    });

    it("refuses a full session, a second enrollment, and a fine with a live enrollment", async () => {
      const { userId, citizenId, fineId } = await seedScene();
      const other = await seedScene();
      const sessionId = await seedSession({ capacity: 1 });
      await enroll(other.userId, sessionId, other.fineId);

      await expect(enroll(userId, sessionId, fineId)).resolves.toStrictEqual({
        ok: false,
        reason: "session_full",
      });

      const open = await seedSession();
      await enroll(userId, open, fineId);
      await expect(
        enroll(userId, open, await seedFine(citizenId))
      ).resolves.toStrictEqual({ ok: false, reason: "already_enrolled" });
      await expect(
        enroll(userId, await seedSession(), fineId)
      ).resolves.toStrictEqual({ ok: false, reason: "fine_already_enrolled" });
    });

    it("refuses a session that started and a missing session", async () => {
      const { userId, fineId } = await seedScene();

      await expect(
        enroll(
          userId,
          await seedSession({ startsAt: "2020-01-01T15:00:00Z" }),
          fineId
        )
      ).resolves.toStrictEqual({ ok: false, reason: "session_started" });
      await expect(enroll(userId, randomUUID(), fineId)).resolves.toStrictEqual(
        {
          ok: false,
          reason: "session_not_found",
        }
      );
    });
  });

  describe(cancelEnrollment, () => {
    it("cancels the enrollment of the citizen, and hides it from another user", async () => {
      const { userId, fineId } = await seedScene();
      const other = await seedScene();
      const enrolled = await enroll(userId, await seedSession(), fineId);
      if (!enrolled.ok) {
        throw new Error(enrolled.reason);
      }

      await expect(
        cancelEnrollment(appDatabase, {
          userId: other.userId,
          actorId: other.userId,
          enrollmentId: enrolled.enrollment.id,
        })
      ).resolves.toStrictEqual({ ok: false, reason: "not_found" });

      await expect(
        cancelEnrollment(appDatabase, {
          userId,
          actorId: userId,
          enrollmentId: enrolled.enrollment.id,
        })
      ).resolves.toMatchObject({
        ok: true,
        enrollment: { id: enrolled.enrollment.id, status: "cancelled" },
      });
    });
  });

  describe("enrollment after a cancel", () => {
    it("enrolls the citizen again in the same session, with the same or another fine", async () => {
      const { userId, citizenId, fineId } = await seedScene();
      const otherFineId = await seedFine(citizenId);
      const sessionId = await seedSession();
      const first = await enroll(userId, sessionId, fineId);
      if (!first.ok) {
        throw new Error(first.reason);
      }
      await cancelEnrollment(appDatabase, {
        userId,
        actorId: userId,
        enrollmentId: first.enrollment.id,
      });

      const again = await enroll(userId, sessionId, otherFineId);

      expect(again).toMatchObject({
        ok: true,
        enrollment: {
          id: first.enrollment.id,
          obligationId: otherFineId,
          status: "enrolled",
        },
      });
      await expect(enroll(userId, sessionId, fineId)).resolves.toStrictEqual({
        ok: false,
        reason: "already_enrolled",
      });
    });
  });

  describe(listCourses, () => {
    it("lists the open sessions with the seats left, the enrollments, and the eligible fines", async () => {
      const { userId, citizenId, fineId } = await seedScene();
      const sessionId = await seedSession({ capacity: 3 });
      await seedSession({ startsAt: "2020-01-01T15:00:00Z" });
      const enrolled = await enroll(userId, sessionId, fineId);
      const secondFine = await seedFine(citizenId);

      const result = await listCourses(appDatabase, { userId });

      expect(result.hasCitizen).toBeTruthy();
      expect(result.sessions).toContainEqual(
        expect.objectContaining({ id: sessionId, seatsLeft: 2, enrolled: true })
      );
      expect(
        result.sessions.some((item) => item.startsAt.getTime() < Date.now())
      ).toBeFalsy();
      expect(result.enrollments).toMatchObject([
        {
          id: enrolled.ok ? enrolled.enrollment.id : "",
          courseSessionId: sessionId,
          canCancel: true,
        },
      ]);
      expect(result.fines).toStrictEqual([
        expect.objectContaining({ id: secondFine }),
      ]);
    });
  });
});
