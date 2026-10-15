import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import react from "ultracite/oxlint/react";
import tanstack from "ultracite/oxlint/tanstack";
import vitest from "ultracite/oxlint/vitest";

export default defineConfig({
  extends: [core, react, tanstack, vitest, antiSlop],
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    // Generated SQL migrations and agent tooling are managed outside this repository's style.
    "drizzle",
    ".atl",
    ".claude",
    ".agents",
  ],
  options: {
    typeAware: true,
  },
  overrides: [
    {
      // The shadcn CLI generates these files. Keep them as generated, so that `shadcn add --diff` stays clean.
      files: ["src/components/ui/**"],
      rules: {
        "func-style": "off",
        "react/function-component-definition": "off",
        eqeqeq: "off",
        "jsx-a11y/label-has-associated-control": "off",
        "jsx-a11y/prefer-tag-over-role": "off",
        "typescript/promise-function-async": "off",
        "typescript/strict-boolean-expressions": "off",
        "no-use-before-define": "off",
      },
    },
  ],
});
