import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env. Load it here when it exists (local development).
if (existsSync(".env")) {
  process.loadEnvFile(".env");
}

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("Set DATABASE_URL before you run drizzle-kit.");
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
