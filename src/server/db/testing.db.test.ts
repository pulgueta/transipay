import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { createIsolatedDatabase, createTestDatabase } from "./testing";

// The migration fails, and its error message contains the name of the new database.
// The test uses the name to find a database that the cleanup did not remove.
const failingMigration = `DO $$
BEGIN
  RAISE EXCEPTION 'migration failed in %', current_database();
END
$$;`;

describe("isolated database cleanup", () => {
  let migrationsFolder = "";

  beforeAll(async () => {
    migrationsFolder = await mkdtemp(
      path.join(tmpdir(), "transipay-migrations-")
    );
    await mkdir(path.join(migrationsFolder, "meta"));
    await writeFile(
      path.join(migrationsFolder, "meta", "_journal.json"),
      JSON.stringify({
        version: "7",
        dialect: "postgresql",
        entries: [
          {
            idx: 0,
            version: "7",
            when: 1_700_000_000_000,
            tag: "0000_fail",
            breakpoints: true,
          },
        ],
      })
    );
    await writeFile(
      path.join(migrationsFolder, "0000_fail.sql"),
      failingMigration
    );
  });

  afterAll(async () => {
    await rm(migrationsFolder, { force: true, recursive: true });
  });

  it("removes the new database and rethrows the error when a migration fails", async () => {
    const url = inject("testDatabaseUrl");
    let message = "";
    try {
      await createIsolatedDatabase(url, { migrationsFolder });
    } catch (error) {
      // drizzle puts the Postgres error in `cause`.
      message =
        error instanceof Error && error.cause instanceof Error
          ? error.cause.message
          : String(error);
    }
    const name = /migration failed in (?<name>transipay_test_[0-9a-f]+)/u.exec(
      message
    )?.groups?.name;
    expect(name).toBeDefined();

    const { pool } = createTestDatabase(url);
    try {
      const result = await pool.query(
        "select 1 from pg_database where datname = $1",
        [name]
      );
      expect(result.rowCount).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
