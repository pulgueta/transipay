import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import {
  bookAppointment,
  cancelAppointment,
  listAppointments,
  readBookingOptions,
} from "./appointments";

let database: ReturnType<typeof createTestDatabase>;
let appDatabase: Database;

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);
const FUTURE = new Date("2030-01-01T15:00:00Z");

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

/** An entity with one branch and one procedure type. */
const seedOffer = async (kind = "cda") => {
  const entityId = await queryId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ($1, $2, $3, 'entity@example.com', '3000000000') returning id`,
    [kind, `Entity ${unique()}`, unique()]
  );
  const branchId = await queryId(
    `insert into branch (entity_id, name, address) values ($1, $2, 'Street 1') returning id`,
    [entityId, unique()]
  );
  const procedureTypeId = await queryId(
    `insert into procedure_type (entity_id, code, name, amount_in_cents)
     values ($1, $2, 'Technical inspection', 50000) returning id`,
    [entityId, unique()]
  );
  return { entityId, branchId, procedureTypeId };
};

const seedProcedureObligation = async (
  citizenId: string,
  offer: { entityId: string; procedureTypeId: string },
  status = "pending"
) => {
  const obligationId = await queryId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents, status)
     values ($1, $2, 'procedure', $3, 50000, $4) returning id`,
    [citizenId, offer.entityId, unique(), status]
  );
  await database.pool.query(
    `insert into procedure (obligation_id, entity_id, procedure_type_id) values ($1, $2, $3)`,
    [obligationId, offer.entityId, offer.procedureTypeId]
  );
  return obligationId;
};

const seedScene = async () => {
  const userId = await seedUser();
  const citizenId = await seedCitizen(userId);
  const offer = await seedOffer();
  return { userId, citizenId, offer };
};

const bookingInput = (
  userId: string,
  offer: { entityId: string; branchId: string; procedureTypeId: string },
  extra: { obligationId?: string | null; scheduledAt?: Date } = {}
) => ({
  userId,
  actorId: userId,
  entityId: offer.entityId,
  branchId: offer.branchId,
  procedureTypeId: offer.procedureTypeId,
  obligationId: extra.obligationId ?? null,
  scheduledAt: extra.scheduledAt ?? FUTURE,
});

describe("appointments", () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  describe(bookAppointment, () => {
    it("books an appointment for the citizen and returns the stored row", async () => {
      const { userId, citizenId, offer } = await seedScene();
      const obligationId = await seedProcedureObligation(citizenId, offer);

      const outcome = await bookAppointment(
        appDatabase,
        bookingInput(userId, offer, { obligationId })
      );

      expect(outcome).toMatchObject({
        ok: true,
        appointment: { status: "scheduled", scheduledAt: FUTURE, obligationId },
      });
    });

    it("refuses a branch of another entity", async () => {
      const { userId, offer } = await seedScene();
      const other = await seedOffer();

      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(userId, { ...offer, branchId: other.branchId })
        )
      ).resolves.toStrictEqual({ ok: false, reason: "branch_not_found" });
    });

    it("refuses a procedure type of another entity", async () => {
      const { userId, offer } = await seedScene();
      const other = await seedOffer();

      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(userId, {
            ...offer,
            procedureTypeId: other.procedureTypeId,
          })
        )
      ).resolves.toStrictEqual({
        ok: false,
        reason: "procedure_type_not_found",
      });
    });

    it("refuses an obligation of another citizen or one that is not pending", async () => {
      const { userId, offer } = await seedScene();
      const other = await seedScene();
      const foreign = await seedProcedureObligation(other.citizenId, offer);
      const paid = await seedProcedureObligation(
        other.citizenId,
        offer,
        "paid"
      );

      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(userId, offer, { obligationId: foreign })
        )
      ).resolves.toStrictEqual({ ok: false, reason: "obligation_not_found" });
      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(other.userId, offer, { obligationId: paid })
        )
      ).resolves.toStrictEqual({ ok: false, reason: "obligation_not_found" });
    });

    it("refuses an obligation of another entity or another procedure type", async () => {
      const { userId, citizenId, offer } = await seedScene();
      const otherEntity = await seedOffer();
      const otherTypeId = await queryId(
        `insert into procedure_type (entity_id, code, name, amount_in_cents)
         values ($1, $2, 'Plate change', 30000) returning id`,
        [offer.entityId, unique()]
      );
      const obligationId = await seedProcedureObligation(citizenId, offer);

      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(userId, otherEntity, { obligationId })
        )
      ).resolves.toStrictEqual({ ok: false, reason: "obligation_mismatch" });
      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(
            userId,
            { ...offer, procedureTypeId: otherTypeId },
            { obligationId }
          )
        )
      ).resolves.toStrictEqual({ ok: false, reason: "obligation_mismatch" });
    });

    it("refuses a time that is too soon and a user without a citizen record", async () => {
      const { userId, offer } = await seedScene();

      await expect(
        bookAppointment(
          appDatabase,
          bookingInput(userId, offer, { scheduledAt: new Date() })
        )
      ).resolves.toStrictEqual({ ok: false, reason: "too_soon" });
      await expect(
        bookAppointment(appDatabase, bookingInput(await seedUser(), offer))
      ).resolves.toStrictEqual({ ok: false, reason: "no_citizen" });
    });
  });

  describe(cancelAppointment, () => {
    it("cancels a scheduled appointment of the citizen", async () => {
      const { userId, offer } = await seedScene();
      const booked = await bookAppointment(
        appDatabase,
        bookingInput(userId, offer)
      );
      if (!booked.ok) {
        throw new Error(booked.reason);
      }

      const outcome = await cancelAppointment(appDatabase, {
        userId,
        actorId: userId,
        appointmentId: booked.appointment.id,
      });

      expect(outcome).toMatchObject({
        ok: true,
        appointment: { id: booked.appointment.id, status: "cancelled" },
      });
    });

    it("does not let another user cancel it, and does not tell that it exists", async () => {
      const { userId, offer } = await seedScene();
      const other = await seedScene();
      const booked = await bookAppointment(
        appDatabase,
        bookingInput(userId, offer)
      );
      if (!booked.ok) {
        throw new Error(booked.reason);
      }

      await expect(
        cancelAppointment(appDatabase, {
          userId: other.userId,
          actorId: other.userId,
          appointmentId: booked.appointment.id,
        })
      ).resolves.toStrictEqual({ ok: false, reason: "not_found" });
      await expect(
        listAppointments(appDatabase, { userId })
      ).resolves.toMatchObject({
        upcoming: [{ id: booked.appointment.id, status: "scheduled" }],
      });
    });
  });

  describe(listAppointments, () => {
    it("lists only the appointments of the citizen, split by time", async () => {
      const { userId, citizenId, offer } = await seedScene();
      const other = await seedScene();
      await bookAppointment(appDatabase, bookingInput(other.userId, offer));
      await database.pool.query(
        `insert into appointment (citizen_id, entity_id, branch_id, procedure_type_id, scheduled_at, status)
         values ($1, $2, $3, $4, '2020-01-01T15:00:00Z', 'attended')`,
        [citizenId, offer.entityId, offer.branchId, offer.procedureTypeId]
      );
      const booked = await bookAppointment(
        appDatabase,
        bookingInput(userId, offer)
      );

      const result = await listAppointments(appDatabase, { userId });

      expect(result).toMatchObject({
        hasCitizen: true,
        upcoming: [
          {
            id: booked.ok ? booked.appointment.id : "",
            procedureTypeName: "Technical inspection",
            canCancel: true,
          },
        ],
        past: [{ status: "attended", canCancel: false }],
      });
    });
  });

  describe(readBookingOptions, () => {
    it("gives the entities with their branches and procedure types, and the pending procedures of the citizen", async () => {
      const { userId, citizenId, offer } = await seedScene();
      const obligationId = await seedProcedureObligation(citizenId, offer);
      await seedProcedureObligation(citizenId, offer, "paid");

      const options = await readBookingOptions(appDatabase, { userId });

      expect(options.entities).toContainEqual(
        expect.objectContaining({
          id: offer.entityId,
          branches: [expect.objectContaining({ id: offer.branchId })],
          procedureTypes: [
            expect.objectContaining({ id: offer.procedureTypeId }),
          ],
        })
      );
      expect(options.obligations).toStrictEqual([
        expect.objectContaining({
          id: obligationId,
          entityId: offer.entityId,
          procedureTypeId: offer.procedureTypeId,
        }),
      ]);
    });
  });
});
