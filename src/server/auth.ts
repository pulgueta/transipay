import "@tanstack/react-start/server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { serverEnv } from "@/env/server";
import { ac, roles } from "@/lib/auth/permissions";

import { db } from "./db/client";
import { account, session, user, verification } from "./db/schema/auth";

export const auth = betterAuth({
  appName: "Transipay",
  baseURL: serverEnv.BETTER_AUTH_URL,
  secret: serverEnv.BETTER_AUTH_SECRET,
  trustedOrigins: [new URL(serverEnv.BETTER_AUTH_URL).origin],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  // Memory storage is correct for one Node process. Use "database" or secondary storage with more instances.
  rateLimit: {
    enabled: true,
  },
  advanced: {
    // The pg adapter leaves the id to the database default: uuidv7().
    database: { generateId: "uuid" },
    useSecureCookies: serverEnv.NODE_ENV === "production",
    cookiePrefix: "transipay",
  },
  plugins: [
    admin({ ac, roles, defaultRole: "citizen", adminRoles: ["admin"] }),
    // Must be the last plugin. It sets cookies through TanStack Start.
    tanstackStartCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
