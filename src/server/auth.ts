import "@tanstack/react-start/server-only";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";

import { serverEnv } from "@/env/server";
import { ac, roles } from "@/lib/auth/permissions";

import { db } from "./db/client";
import { account, session, user, verification } from "./db/schema/auth";

export const createAuth = <TSchema extends Record<string, unknown>>(
  database: PgDatabase<NodePgQueryResultHKT, TSchema>
) =>
  betterAuth({
    appName: "Transipay",
    baseURL: serverEnv.BETTER_AUTH_URL,
    secret: serverEnv.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(serverEnv.BETTER_AUTH_URL).origin],
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    // HTTP callers cannot bypass the transaction that sets the audit actor.
    disabledPaths: [
      "/admin/set-role",
      "/admin/ban-user",
      "/admin/unban-user",
      "/admin/remove-user",
      "/admin/update-user",
      "/admin/create-user",
      "/admin/set-user-password",
    ],
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
      cookiePrefix: "transipay",
    },
    plugins: [
      admin({ ac, roles, defaultRole: "citizen", adminRoles: ["admin"] }),
      // Must be the last plugin. It sets cookies through TanStack Start.
      tanstackStartCookies(),
    ],
  });

export const auth = createAuth(db);

export type AuthSession = typeof auth.$Infer.Session;
