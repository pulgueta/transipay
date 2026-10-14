import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env. Load it here when it exists (local development).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

// Migrations run as the table owner (DATABASE_OWNER_URL).
// When DATABASE_OWNER_URL is not set, drizzle-kit uses DATABASE_URL (for example, in CI).
const ownerUrl = process.env.DATABASE_OWNER_URL;
const databaseUrl =
  ownerUrl === undefined || ownerUrl === ""
    ? process.env.DATABASE_URL
    : ownerUrl;

if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error(
    "Set DATABASE_OWNER_URL (or DATABASE_URL) before you run drizzle-kit."
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema",
  out: "./drizzle",
  casing: "snake_case",
  schemaFilter: ["public", "auth"],
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
