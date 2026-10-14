import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createTestDatabase } from "./testing";

const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";

let pool: Pool;

const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

/** Runs an INSERT ... RETURNING id and gives the id. */
const insertId = async (text: string, values: unknown[]) => {
  const result = await pool.query<{ id: string }>(text, values);
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The insert returned no row.");
  }
  return row.id;
};

const seedEntity = async (kind = "transit_authority") =>
  await insertId(
    `insert into entity (kind, name, tax_id, email, phone)
     values ($1, 'Entity', $2, 'entity@example.com', '3000000000') returning id`,
    [kind, unique()]
  );

const seedCitizen = async () =>
  await insertId(
    `insert into citizen (document_type, document_number, first_name, last_name)
     values ('CC', $1, 'Ana', 'Rojas') returning id`,
    [unique()]
  );

const seedObligation = async (input: {
  citizenId: string;
  entityId: string;
  kind?: "fine" | "procedure";
  amountInCents?: number;
}) =>
  await insertId(
    `insert into obligation (citizen_id, entity_id, kind, number, amount_in_cents)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      input.citizenId,
      input.entityId,
      input.kind ?? "fine",
      unique(),
      input.amountInCents ?? 100_000,
    ]
  );

const seedBranch = async (entityId: string) =>
  await insertId(
    `insert into branch (entity_id, name, address) values ($1, $2, 'Street 1') returning id`,
    [entityId, unique()]
  );

const seedProcedureType = async (entityId: string) =>
  await insertId(
    `insert into procedure_type (entity_id, code, name, amount_in_cents)
     values ($1, $2, 'Procedure', 50000) returning id`,
    [entityId, unique()]
  );

const seedBankAccount = async (entityId: string) =>
  await insertId(
    `insert into entity_bank_account
       (entity_id, bank_id, account_type, account_number, holder_name, holder_legal_id_type, holder_legal_id)
     values ($1, '1007', 'AHORROS', $2, 'Holder', 'NIT', '900000000') returning id`,
    [entityId, unique()]
  );

const seedAgreement = async (obligationId: string) =>
  await insertId(
    `insert into payment_agreement (obligation_id, installment_count) values ($1, 2) returning id`,
    [obligationId]
  );

const insertInstallment = async (agreementId: string, obligationId: string) =>
  await insertId(
    `insert into installment (payment_agreement_id, obligation_id, number, due_on, amount_in_cents)
     values ($1, $2, 1, '2030-01-01', 50000) returning id`,
    [agreementId, obligationId]
  );

const insertPayment = async (input: {
  citizenId: string;
  obligationId: string;
  installmentId: string | null;
}) =>
  await insertId(
    `insert into payment (citizen_id, obligation_id, installment_id, amount_in_cents, reference)
     values ($1, $2, $3, 50000, $4) returning id`,
    [input.citizenId, input.obligationId, input.installmentId, unique()]
  );

const insertPayout = async (entityId: string, bankAccountId: string) =>
  await insertId(
    `insert into payout (entity_id, entity_bank_account_id, amount_in_cents, reference, idempotency_key)
     values ($1, $2, 50000, $3, $4) returning id`,
    [entityId, bankAccountId, unique(), unique()]
  );

const insertCourseSession = async (entityId: string, branchId: string) =>
  await insertId(
    `insert into course_session (entity_id, branch_id, starts_at, ends_at, capacity, discount_percent)
     values ($1, $2, '2030-01-01T10:00:00Z', '2030-01-01T12:00:00Z', 20, 50) returning id`,
    [entityId, branchId]
  );

const insertEnrollment = async (input: {
  courseSessionId: string;
  citizenId: string;
  obligationId: string;
}) =>
  await insertId(
    `insert into course_enrollment (course_session_id, citizen_id, obligation_id)
     values ($1, $2, $3) returning id`,
    [input.courseSessionId, input.citizenId, input.obligationId]
  );

const insertNotification = async (
  citizenId: string,
  obligationId: string | null
) =>
  await insertId(
    `insert into notification (citizen_id, obligation_id, channel, template, body)
     values ($1, $2, 'email', 'fine_issued', 'You have a new fine.') returning id`,
    [citizenId, obligationId]
  );

const insertProcedure = async (input: {
  obligationId: string;
  entityId: string;
  procedureTypeId: string;
}) =>
  await pool.query(
    `insert into procedure (obligation_id, entity_id, procedure_type_id) values ($1, $2, $3)`,
    [input.obligationId, input.entityId, input.procedureTypeId]
  );

const insertAppointment = async (input: {
  citizenId: string;
  entityId: string;
  branchId: string;
  procedureTypeId: string;
  obligationId: string | null;
}) =>
  await insertId(
    `insert into appointment (citizen_id, entity_id, branch_id, procedure_type_id, obligation_id, scheduled_at)
     values ($1, $2, $3, $4, $5, '2030-01-01T10:00:00Z') returning id`,
    [
      input.citizenId,
      input.entityId,
      input.branchId,
      input.procedureTypeId,
      input.obligationId,
    ]
  );

const seedPlan = async () => {
  const citizenId = await seedCitizen();
  const obligationId = await seedObligation({
    citizenId,
    entityId: await seedEntity(),
  });
  const agreementId = await seedAgreement(obligationId);
  return { citizenId, obligationId, agreementId };
};

const seedCourse = async () => {
  const ceaId = await seedEntity("cea");
  return await insertCourseSession(ceaId, await seedBranch(ceaId));
};

const seedProcedureObligation = async (entityId: string) =>
  await seedObligation({
    citizenId: await seedCitizen(),
    entityId,
    kind: "procedure",
  });

const seedOffer = async () => {
  const entityId = await seedEntity("cda");
  return {
    entityId,
    branchId: await seedBranch(entityId),
    procedureTypeId: await seedProcedureType(entityId),
  };
};

describe("domain invariants", () => {
  beforeAll(() => {
    ({ pool } = createTestDatabase(inject("testDatabaseUrl")));
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("payout: the bank account belongs to the payout entity", () => {
    it("accepts an account of the same entity", async () => {
      const entityId = await seedEntity("cda");
      const accountId = await seedBankAccount(entityId);
      await expect(insertPayout(entityId, accountId)).resolves.toBeTypeOf(
        "string"
      );
    });

    it("rejects an INSERT with an account of another entity", async () => {
      const entityId = await seedEntity("cda");
      const otherAccountId = await seedBankAccount(await seedEntity("cea"));
      await expect(
        insertPayout(entityId, otherAccountId)
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an UPDATE to an account of another entity", async () => {
      const entityId = await seedEntity("cda");
      const payoutId = await insertPayout(
        entityId,
        await seedBankAccount(entityId)
      );
      const otherAccountId = await seedBankAccount(await seedEntity("cea"));
      await expect(
        pool.query(
          "update payout set entity_bank_account_id = $1 where id = $2",
          [otherAccountId, payoutId]
        )
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("payment: the installment belongs to an agreement of the same obligation", () => {
    it("accepts an installment of the same obligation and a payment without installment", async () => {
      const plan = await seedPlan();
      const installmentId = await insertInstallment(
        plan.agreementId,
        plan.obligationId
      );
      await expect(
        insertPayment({ ...plan, installmentId })
      ).resolves.toBeTypeOf("string");
      await expect(
        insertPayment({ ...plan, installmentId: null })
      ).resolves.toBeTypeOf("string");
    });

    it("rejects an installment INSERT with an obligation that is not the agreement obligation", async () => {
      const plan = await seedPlan();
      const other = await seedPlan();
      await expect(
        insertInstallment(plan.agreementId, other.obligationId)
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects a payment INSERT with an installment of another obligation", async () => {
      const plan = await seedPlan();
      const other = await seedPlan();
      const otherInstallmentId = await insertInstallment(
        other.agreementId,
        other.obligationId
      );
      await expect(
        insertPayment({ ...plan, installmentId: otherInstallmentId })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects a payment UPDATE to an installment of another obligation", async () => {
      const plan = await seedPlan();
      const paymentId = await insertPayment({
        ...plan,
        installmentId: await insertInstallment(
          plan.agreementId,
          plan.obligationId
        ),
      });
      const other = await seedPlan();
      const otherInstallmentId = await insertInstallment(
        other.agreementId,
        other.obligationId
      );
      await expect(
        pool.query("update payment set installment_id = $1 where id = $2", [
          otherInstallmentId,
          paymentId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an installment UPDATE to another obligation", async () => {
      const plan = await seedPlan();
      const installmentId = await insertInstallment(
        plan.agreementId,
        plan.obligationId
      );
      const other = await seedPlan();
      await expect(
        pool.query("update installment set obligation_id = $1 where id = $2", [
          other.obligationId,
          installmentId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("course_enrollment: the obligation is a fine of the enrolled citizen", () => {
    it("accepts a CEA course that discounts an ITTB fine of the citizen", async () => {
      const ittbId = await seedEntity("transit_authority");
      const citizenId = await seedCitizen();
      const fineId = await seedObligation({ citizenId, entityId: ittbId });
      await expect(
        insertEnrollment({
          courseSessionId: await seedCourse(),
          citizenId,
          obligationId: fineId,
        })
      ).resolves.toBeTypeOf("string");
    });

    it("rejects an INSERT with a fine of another citizen", async () => {
      const entityId = await seedEntity();
      const otherFineId = await seedObligation({
        citizenId: await seedCitizen(),
        entityId,
      });
      await expect(
        insertEnrollment({
          courseSessionId: await seedCourse(),
          citizenId: await seedCitizen(),
          obligationId: otherFineId,
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an INSERT with a procedure of the citizen", async () => {
      const citizenId = await seedCitizen();
      const procedureId = await seedObligation({
        citizenId,
        entityId: await seedEntity(),
        kind: "procedure",
      });
      await expect(
        insertEnrollment({
          courseSessionId: await seedCourse(),
          citizenId,
          obligationId: procedureId,
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an UPDATE to a fine of another citizen or to a procedure", async () => {
      const entityId = await seedEntity();
      const citizenId = await seedCitizen();
      const enrollmentId = await insertEnrollment({
        courseSessionId: await seedCourse(),
        citizenId,
        obligationId: await seedObligation({ citizenId, entityId }),
      });
      const otherFineId = await seedObligation({
        citizenId: await seedCitizen(),
        entityId,
      });
      const procedureId = await seedObligation({
        citizenId,
        entityId,
        kind: "procedure",
      });
      await expect(
        pool.query(
          "update course_enrollment set obligation_id = $1 where id = $2",
          [otherFineId, enrollmentId]
        )
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      await expect(
        pool.query(
          "update course_enrollment set obligation_id = $1 where id = $2",
          [procedureId, enrollmentId]
        )
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("notification: the obligation belongs to the recipient citizen", () => {
    it("accepts an obligation of the citizen and no obligation", async () => {
      const citizenId = await seedCitizen();
      const obligationId = await seedObligation({
        citizenId,
        entityId: await seedEntity(),
      });
      await expect(
        insertNotification(citizenId, obligationId)
      ).resolves.toBeTypeOf("string");
      await expect(insertNotification(citizenId, null)).resolves.toBeTypeOf(
        "string"
      );
    });

    it("rejects an INSERT with an obligation of another citizen", async () => {
      const otherObligationId = await seedObligation({
        citizenId: await seedCitizen(),
        entityId: await seedEntity(),
      });
      await expect(
        insertNotification(await seedCitizen(), otherObligationId)
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an obligation UPDATE that moves it to another citizen", async () => {
      const citizenId = await seedCitizen();
      const obligationId = await seedObligation({
        citizenId,
        entityId: await seedEntity(),
      });
      await insertNotification(citizenId, obligationId);
      await expect(
        pool.query("update obligation set citizen_id = $1 where id = $2", [
          await seedCitizen(),
          obligationId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("procedure: the procedure type belongs to the obligation creditor", () => {
    it("accepts a procedure type of the creditor", async () => {
      const entityId = await seedEntity("cda");
      await expect(
        insertProcedure({
          obligationId: await seedProcedureObligation(entityId),
          entityId,
          procedureTypeId: await seedProcedureType(entityId),
        })
      ).resolves.toBeDefined();
    });

    it("rejects an INSERT with a procedure type of another entity", async () => {
      const entityId = await seedEntity("cda");
      const otherTypeId = await seedProcedureType(await seedEntity("cea"));
      await expect(
        insertProcedure({
          obligationId: await seedProcedureObligation(entityId),
          entityId,
          procedureTypeId: otherTypeId,
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an INSERT with an entity that is not the obligation creditor", async () => {
      const entityId = await seedEntity("cda");
      const otherId = await seedEntity("cea");
      await expect(
        insertProcedure({
          obligationId: await seedProcedureObligation(entityId),
          entityId: otherId,
          procedureTypeId: await seedProcedureType(otherId),
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an UPDATE to a procedure type of another entity", async () => {
      const entityId = await seedEntity("cda");
      const obligationId = await seedProcedureObligation(entityId);
      await insertProcedure({
        obligationId,
        entityId,
        procedureTypeId: await seedProcedureType(entityId),
      });
      const otherTypeId = await seedProcedureType(await seedEntity("cea"));
      await expect(
        pool.query(
          "update procedure set procedure_type_id = $1 where obligation_id = $2",
          [otherTypeId, obligationId]
        )
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an obligation UPDATE that changes the creditor", async () => {
      const entityId = await seedEntity("cda");
      const obligationId = await seedProcedureObligation(entityId);
      await insertProcedure({
        obligationId,
        entityId,
        procedureTypeId: await seedProcedureType(entityId),
      });
      await expect(
        pool.query("update obligation set entity_id = $1 where id = $2", [
          await seedEntity("cea"),
          obligationId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("appointment: branch and procedure type of one entity, obligation of the citizen", () => {
    it("accepts a branch and type of one entity, with and without an obligation", async () => {
      const offer = await seedOffer();
      const citizenId = await seedCitizen();
      const obligationId = await seedObligation({
        citizenId,
        entityId: offer.entityId,
        kind: "procedure",
      });
      await expect(
        insertAppointment({ ...offer, citizenId, obligationId })
      ).resolves.toBeTypeOf("string");
      await expect(
        insertAppointment({ ...offer, citizenId, obligationId: null })
      ).resolves.toBeTypeOf("string");
    });

    it("rejects an INSERT with a procedure type of another entity", async () => {
      const offer = await seedOffer();
      const other = await seedOffer();
      await expect(
        insertAppointment({
          ...offer,
          procedureTypeId: other.procedureTypeId,
          citizenId: await seedCitizen(),
          obligationId: null,
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an INSERT with a branch of another entity", async () => {
      const offer = await seedOffer();
      const other = await seedOffer();
      await expect(
        insertAppointment({
          ...offer,
          branchId: other.branchId,
          citizenId: await seedCitizen(),
          obligationId: null,
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an INSERT with an obligation of another citizen", async () => {
      const offer = await seedOffer();
      const otherObligationId = await seedObligation({
        citizenId: await seedCitizen(),
        entityId: offer.entityId,
      });
      await expect(
        insertAppointment({
          ...offer,
          citizenId: await seedCitizen(),
          obligationId: otherObligationId,
        })
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an UPDATE to a branch of another entity or an obligation of another citizen", async () => {
      const offer = await seedOffer();
      const appointmentId = await insertAppointment({
        ...offer,
        citizenId: await seedCitizen(),
        obligationId: null,
      });
      const other = await seedOffer();
      await expect(
        pool.query("update appointment set branch_id = $1 where id = $2", [
          other.branchId,
          appointmentId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
      const otherObligationId = await seedObligation({
        citizenId: await seedCitizen(),
        entityId: offer.entityId,
      });
      await expect(
        pool.query("update appointment set obligation_id = $1 where id = $2", [
          otherObligationId,
          appointmentId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("course_session: the branch belongs to the session entity", () => {
    it("accepts a branch of the session entity", async () => {
      const entityId = await seedEntity("cea");
      await expect(
        insertCourseSession(entityId, await seedBranch(entityId))
      ).resolves.toBeTypeOf("string");
    });

    it("rejects an INSERT with a branch of another entity", async () => {
      const otherBranchId = await seedBranch(await seedEntity("cda"));
      await expect(
        insertCourseSession(await seedEntity("cea"), otherBranchId)
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it("rejects an UPDATE to another entity", async () => {
      const entityId = await seedEntity("cea");
      const sessionId = await insertCourseSession(
        entityId,
        await seedBranch(entityId)
      );
      await expect(
        pool.query("update course_session set entity_id = $1 where id = $2", [
          await seedEntity("cea"),
          sessionId,
        ])
      ).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });
  });

  describe("obligation: a procedure can be free, a fine cannot", () => {
    it("accepts a procedure with an amount of zero", async () => {
      await expect(
        seedObligation({
          citizenId: await seedCitizen(),
          entityId: await seedEntity(),
          kind: "procedure",
          amountInCents: 0,
        })
      ).resolves.toBeTypeOf("string");
    });

    it("rejects an INSERT of a fine with an amount of zero", async () => {
      await expect(
        seedObligation({
          citizenId: await seedCitizen(),
          entityId: await seedEntity(),
          kind: "fine",
          amountInCents: 0,
        })
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it("rejects an INSERT of a procedure with a negative amount", async () => {
      await expect(
        seedObligation({
          citizenId: await seedCitizen(),
          entityId: await seedEntity(),
          kind: "procedure",
          amountInCents: -1,
        })
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });

    it("rejects an UPDATE of a fine amount to zero", async () => {
      const obligationId = await seedObligation({
        citizenId: await seedCitizen(),
        entityId: await seedEntity(),
      });
      await expect(
        pool.query("update obligation set amount_in_cents = 0 where id = $1", [
          obligationId,
        ])
      ).rejects.toMatchObject({ code: CHECK_VIOLATION });
    });
  });
});
