import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

/**
 * Makes a CHECK constraint that limits a text column to a fixed list.
 * The list is the same `as const` array that types the column, so the database and TypeScript agree.
 */
export const checkIn = (
  name: string,
  column: AnyPgColumn,
  values: readonly string[]
) => check(name, sql`${column} in (${sql.raw(values.map(quote).join(", "))})`);
