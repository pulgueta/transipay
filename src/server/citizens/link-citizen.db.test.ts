import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { schema } from "@/server/db/client";
import type { Database } from "@/server/db/client";
import { createTestDatabase } from "@/server/db/testing";

import { linkCitizen } from "./link-citizen";

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

const seedUser = async (name = "Ana Maria Rojas") => {
  const email = `${unique()}@example.com`;
  const id = await queryId(
    `insert into auth."user" (name, email, role) values ($1, $2, 'citizen') returning id`,
    [name, email]
  );
  return { id, name, email };
};

const seedCitizen = async (
  documentNumber: string,
  userId: string | null = null,
  email: string | null = null
) =>
  await queryId(
    `insert into citizen (user_id, document_type, document_number, first_name, last_name, email)
     values ($1, 'CC', $2, 'Registered', 'Person', $3) returning id`,
    [userId, documentNumber, email]
  );

const readCitizen = async (id: string) => {
  const result = await database.pool.query<{
    user_id: string | null;
    first_name: string;
    last_name: string;
    email: string | null;
  }>(
    "select user_id, first_name, last_name, email from citizen where id = $1",
    [id]
  );
  return result.rows.at(0);
};

const input = (
  user: { id: string; name: string; email: string },
  documentNumber: string
) => ({
  userId: user.id,
  actorId: user.id,
  name: user.name,
  email: user.email,
  documentType: "CC" as const,
  documentNumber,
});

describe(linkCitizen, () => {
  beforeAll(() => {
    database = createTestDatabase(inject("testDatabaseUrl"));
    appDatabase = drizzle(database.pool, { schema, casing: "snake_case" });
  });

  afterAll(async () => {
    await database.pool.end();
  });

  it("creates a citizen from the user when the document is new", async () => {
    const user = await seedUser("Ana Maria Rojas");
    const outcome = await linkCitizen(appDatabase, input(user, unique()));

    expect(outcome).toMatchObject({ ok: true, created: true });
    if (!outcome.ok) {
      throw new Error("unreachable");
    }
    await expect(readCitizen(outcome.citizenId)).resolves.toStrictEqual({
      user_id: user.id,
      first_name: "Ana",
      last_name: "Maria Rojas",
      email: user.email,
    });
  });

  it("finds the registered citizen when the number has another case", async () => {
    const stored = `AB${unique().toUpperCase()}`;
    const user = await seedUser();
    const citizenId = await seedCitizen(stored, null, user.email);

    const outcome = await linkCitizen(
      appDatabase,
      input(user, stored.toLowerCase())
    );

    expect(outcome).toStrictEqual({ ok: true, citizenId, created: false });
  });

  it("uses the full name as the first name when there is one word", async () => {
    const user = await seedUser("Madonna");
    const outcome = await linkCitizen(appDatabase, input(user, unique()));

    if (!outcome.ok) {
      throw new Error("unreachable");
    }
    await expect(readCitizen(outcome.citizenId)).resolves.toMatchObject({
      first_name: "Madonna",
      last_name: "",
    });
  });

  it("links the registered citizen when its email is the user email", async () => {
    const documentNumber = unique().toUpperCase();
    const user = await seedUser();
    const citizenId = await seedCitizen(
      documentNumber,
      null,
      `  ${user.email.toUpperCase()} `
    );

    const outcome = await linkCitizen(appDatabase, input(user, documentNumber));

    expect(outcome).toStrictEqual({ ok: true, citizenId, created: false });
    await expect(readCitizen(citizenId)).resolves.toMatchObject({
      user_id: user.id,
      first_name: "Registered",
      last_name: "Person",
    });
  });

  it("writes an audit row with the actor when it links a registered citizen", async () => {
    const documentNumber = unique().toUpperCase();
    const user = await seedUser();
    const citizenId = await seedCitizen(documentNumber, null, user.email);

    await linkCitizen(appDatabase, input(user, documentNumber));

    const audit = await database.pool.query<{ actor_user_id: string | null }>(
      "select actor_user_id from audit_log where table_name = 'citizen' and record_id = $1 and action = 'update'",
      [citizenId]
    );
    expect(audit.rows).toStrictEqual([{ actor_user_id: user.id }]);
  });

  it("refuses to link a registered citizen that has no email", async () => {
    const documentNumber = unique().toUpperCase();
    const citizenId = await seedCitizen(documentNumber);
    const user = await seedUser();

    const outcome = await linkCitizen(appDatabase, input(user, documentNumber));

    expect(outcome).toStrictEqual({
      ok: false,
      reason: "document_needs_verification",
    });
    await expect(readCitizen(citizenId)).resolves.toMatchObject({
      user_id: null,
    });
  });

  it("refuses to link a registered citizen with a different email", async () => {
    const documentNumber = unique().toUpperCase();
    const citizenId = await seedCitizen(
      documentNumber,
      null,
      "other@example.com"
    );
    const user = await seedUser();

    const outcome = await linkCitizen(appDatabase, input(user, documentNumber));

    expect(outcome).toStrictEqual({
      ok: false,
      reason: "document_needs_verification",
    });
    await expect(readCitizen(citizenId)).resolves.toMatchObject({
      user_id: null,
    });
  });

  it("does nothing the second time for the same user and document", async () => {
    const user = await seedUser();
    const documentNumber = unique().toUpperCase();
    const first = await linkCitizen(appDatabase, input(user, documentNumber));
    const second = await linkCitizen(appDatabase, input(user, documentNumber));

    if (!first.ok) {
      throw new Error("unreachable");
    }
    expect(second).toStrictEqual({
      ok: true,
      citizenId: first.citizenId,
      created: false,
    });
  });

  it("refuses a document that belongs to another user", async () => {
    const owner = await seedUser();
    const documentNumber = unique().toUpperCase();
    const citizenId = await seedCitizen(documentNumber, owner.id);
    const user = await seedUser();

    const outcome = await linkCitizen(appDatabase, input(user, documentNumber));

    expect(outcome).toStrictEqual({
      ok: false,
      reason: "document_belongs_to_other_user",
    });
    await expect(readCitizen(citizenId)).resolves.toMatchObject({
      user_id: owner.id,
    });
  });

  it("refuses a second document for a user that already has a citizen", async () => {
    const user = await seedUser();
    await linkCitizen(appDatabase, input(user, unique()));

    const outcome = await linkCitizen(appDatabase, input(user, unique()));

    expect(outcome).toStrictEqual({ ok: false, reason: "user_already_linked" });
  });
});
