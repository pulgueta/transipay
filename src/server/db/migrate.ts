/**
 * Applies the migrations in `drizzle/` as the table owner (DATABASE_OWNER_URL, or DATABASE_URL when it is not set).
 * The pre-deploy command runs it with plain `node`, so it imports only packages.
 * Unlike `drizzle-kit migrate`, it prints the database error when a migration fails.
 * It first waits for the database, because a sleeping database can time out on the first connection.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { waitForDatabase } from "./wait-for-database.ts";

const migrationsFolder = new URL("../../../drizzle/", import.meta.url).pathname;

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;

if (ownerUrl === undefined || ownerUrl === "") {
  console.error(
    "Set DATABASE_OWNER_URL (or DATABASE_URL) before you run the migrations."
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: ownerUrl,
  connectionTimeoutMillis: 10_000,
});

try {
  // About two minutes in total: 12 attempts, each up to 10 s, with 5 s between them.
  await waitForDatabase(
    async () => {
      await pool.query("select 1");
    },
    {
      attempts: 12,
      delayMs: 5000,
    }
  );
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("The migrations are applied.");
} catch (error) {
  console.error("A migration failed.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
