import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

declare module "vitest" {
  interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

const migrationsFolder = new URL("../../../drizzle/", import.meta.url).pathname;

const ADMIN_SHUTDOWN = "57P01";

/**
 * Makes a pool for a test database.
 * `DROP DATABASE ... WITH (FORCE)` can stop a connection that `pool.end()` did not close yet.
 * The pool ignores only that error (57P01). Other errors on an idle connection still fail the run.
 */
export const createTestPool = (url: string) => {
  const pool = new Pool({ connectionString: url });
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== ADMIN_SHUTDOWN) {
      throw error;
    }
  });
  return pool;
};

export const createTestDatabase = (url: string) => {
  const pool = createTestPool(url);
  return { pool, db: drizzle(pool, { casing: "snake_case" }) };
};

/**
 * Makes a new database with all migrations for one test file.
 * Use it when the code under test reads all rows of a table, so that rows from other test files do not change the result.
 */
export const createIsolatedDatabase = async (url: string) => {
  const name = `transipay_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: url });
  await admin.query(`CREATE DATABASE "${name}"`);
  const isolatedUrl = new URL(url);
  isolatedUrl.pathname = `/${name}`;
  const database = createTestDatabase(isolatedUrl.toString());
  await migrate(database.db, { migrationsFolder });

  return {
    ...database,
    drop: async () => {
      await database.pool.end();
      try {
        await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
};

export const assertPostgresCode = async (
  statement: Promise<unknown>,
  code: string
) => {
  await assert.rejects(statement, { code });
};
