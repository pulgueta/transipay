import {
  boolean,
  index,
  pgSchema,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps, timestamptz } from "./columns";

/**
 * better-auth tables live in their own Postgres schema.
 * Columns follow `pnpm exec auth generate` for better-auth 1.7.7 with the admin plugin.
 * Ids come from the database (`uuidv7()`) because `advanced.database.generateId` is "uuid".
 */
export const authSchema = pgSchema("auth");

export const user = authSchema.table("user", {
  id: id(),
  name: text().notNull(),
  email: text().notNull().unique("user_email_key"),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  // Platform role from the admin plugin. It can hold a comma-separated list, so it has no CHECK.
  role: text().notNull().default("citizen"),
  banned: boolean().notNull().default(false),
  banReason: text(),
  banExpires: timestamptz(),
  ...timestamps(),
});

export const session = authSchema.table(
  "session",
  {
    id: id(),
    expiresAt: timestamptz().notNull(),
    token: text().notNull().unique("session_token_key"),
    ipAddress: text(),
    userAgent: text(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    impersonatedBy: uuid().references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_impersonated_by_idx").on(table.impersonatedBy),
  ]
);

export const account = authSchema.table(
  "account",
  {
    id: id(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    ...timestamps(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    unique("account_provider_id_account_id_key").on(
      table.providerId,
      table.accountId
    ),
  ]
);

export const verification = authSchema.table(
  "verification",
  {
    id: id(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    ...timestamps(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
