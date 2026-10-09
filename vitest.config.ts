import { defineConfig } from "vitest/config";

// Fixed test values let auth load without a local environment file.
const authTestEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://test:test@127.0.0.1/test",
  BETTER_AUTH_URL: "https://auth.example.com",
  BETTER_AUTH_SECRET: "test-only-3E8aK7t2L9v4B6q1H5m0W8c2R6x9",
  WOMPI_PUBLIC_KEY: "test",
  WOMPI_PRIVATE_KEY: "test",
  WOMPI_INTEGRITY_KEY: "test",
  WOMPI_EVENTS_KEY: "test",
  WOMPI_PAYOUTS_API_KEY: "test",
  WOMPI_PAYOUTS_USER_PRINCIPAL_ID: "test",
  WOMPI_PAYOUTS_EVENTS_KEY: "test",
};

// Keep the TanStack Start Vite plugin out of tests.
export default defineConfig({
  envDir: false,
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          env: authTestEnv,
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          env: authTestEnv,
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["./src/server/db/testing-global-setup.ts"],
          // Database tests share one server. A slow machine or CI runner needs more than 5 s.
          testTimeout: 30_000,
          // Some test files make their own database and apply all migrations in a hook.
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
