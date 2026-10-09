import { defineConfig } from "vitest/config";

// Keep the TanStack Start Vite plugin out of tests.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
        },
      },
      {
        test: {
          name: "db",
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
