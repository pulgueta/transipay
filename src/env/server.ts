import "@tanstack/react-start/server-only";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/** Server-only variables. Import this module only from server code. */
export const serverEnv = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    WOMPI_SANDBOX: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    WOMPI_PUBLIC_KEY: z.string().min(1),
    WOMPI_PRIVATE_KEY: z.string().min(1),
    WOMPI_INTEGRITY_KEY: z.string().min(1),
    WOMPI_EVENTS_KEY: z.string().min(1),
    WOMPI_PAYOUTS_API_KEY: z.string().min(1),
    WOMPI_PAYOUTS_USER_PRINCIPAL_ID: z.string().min(1),
    WOMPI_PAYOUTS_EVENTS_KEY: z.string().min(1),
    // Source account for payouts (see `listAccounts`). Payouts fail until it is set.
    WOMPI_PAYOUTS_ACCOUNT_ID: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
