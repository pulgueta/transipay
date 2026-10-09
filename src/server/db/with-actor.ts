import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";

import { db } from "./client";
import type { Transaction } from "./client";

/**
 * Runs `fn` in a transaction that knows the acting user.
 * The audit trigger reads `app.actor_id` and writes it to `audit_log.actor_user_id`.
 * The setting is local to the transaction, so pooled connections do not keep it.
 */
export const withActor = async <T>(
  actorUserId: string,
  fn: (tx: Transaction) => Promise<T>
) =>
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.actor_id', ${actorUserId}, true)`
    );
    return await fn(tx);
  });
