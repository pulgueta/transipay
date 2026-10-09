import { z } from "zod";

/**
 * Keyset pagination on UUIDv7 ids. The ids are time-ordered, so `id` alone gives a stable order.
 *
 * Query pattern (read limit + 1 rows, newest first):
 *
 *   const { cursor, limit } = pageInputSchema.parse(input);
 *   const rows = await db
 *     .select()
 *     .from(payment)
 *     .where(and(eq(payment.citizenId, citizenId), cursor ? lt(payment.id, cursor) : undefined))
 *     .orderBy(desc(payment.id))
 *     .limit(limit + 1);
 *   return toPage(rows, limit);
 */
export const pageInputSchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.int().min(1).max(100).default(20),
});

export type PageInput = z.input<typeof pageInputSchema>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Makes a page from limit + 1 rows. The extra row only shows that a next page exists. */
export const toPage = <T extends { id: string }>(
  rows: T[],
  limit: number
): Page<T> => {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: null };
  }

  const items = rows.slice(0, limit);
  return { items, nextCursor: items.at(-1)?.id ?? null };
};
