import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** UUIDv7 primary key. The database makes the value, so ids are time-ordered. */
export const id = () =>
  uuid()
    .primaryKey()
    .default(sql`uuidv7()`);

/** Timestamp with time zone. Use it for every point in time. */
export const timestamptz = () => timestamp({ withTimezone: true });

export const createdAt = () => timestamptz().notNull().defaultNow();

export const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
