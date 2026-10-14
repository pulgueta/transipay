import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    // Generated SQL migrations and agent tooling are managed outside this repository's style.
    "drizzle",
    ".atl",
    ".claude",
    ".agents",
  ],
});
