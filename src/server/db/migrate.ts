/**
 * Applies the migrations in `drizzle/` as the table owner (DATABASE_OWNER_URL, or DATABASE_URL when it is not set).
 * The pre-deploy command runs it with plain `node`, so it imports only packages.
 * Unlike `drizzle-kit migrate`, it prints the database error when a migration fails.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const migrationsFolder = new URL("../../../drizzle/", import.meta.url).pathname;

const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;

if (ownerUrl === undefined || ownerUrl === "") {
  console.error(
    "Set DATABASE_OWNER_URL (or DATABASE_URL) before you run the migrations."
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: ownerUrl });

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log("The migrations are applied.");
} catch (error) {
  console.error("A migration failed.", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
