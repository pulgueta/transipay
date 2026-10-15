import "@tanstack/react-start/server-only";
import { and, desc, ilike, lt, or } from "drizzle-orm";

import type { Database } from "@/server/db/client";
import { toPage } from "@/server/db/pagination";
import { user } from "@/server/db/schema/auth";

/** Makes `%`, `_`, and `\` normal characters in an ILIKE pattern. */
const escapeLike = (value: string) => value.replaceAll(/[\\%_]/gu, "\\$&");

/**
 * The users for the staff users page, newest first, with a keyset on `id`.
 * A search finds the text in the name or in the email, with no difference between uppercase and lowercase.
 * `total` is the count of all users that match the search.
 */
export const listUsers = async (
  database: Database,
  input: { search?: string; cursor?: string; limit: number }
) => {
  const search = input.search ?? "";
  const pattern = `%${escapeLike(search)}%`;
  const matches =
    search === ""
      ? undefined
      : or(ilike(user.name, pattern), ilike(user.email, pattern));
  const [rows, total] = await Promise.all([
    database
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(
        and(
          matches,
          input.cursor === undefined ? undefined : lt(user.id, input.cursor)
        )
      )
      .orderBy(desc(user.id))
      .limit(input.limit + 1),
    database.$count(user, matches),
  ]);
  const page = toPage(rows, input.limit);
  return { users: page.items, total, nextCursor: page.nextCursor };
};
