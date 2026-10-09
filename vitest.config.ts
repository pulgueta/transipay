import { defineConfig } from "vitest/config";

// Keep the TanStack Start Vite plugin out of unit tests.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // This layer has no tests yet.
    passWithNoTests: true,
  },
});
