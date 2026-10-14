import "@tanstack/react-start/server-only";
import { sql } from "drizzle-orm";

import { db } from "./client";
import type { Database, Transaction } from "./client";

/**
 * Runs `fn` in a transaction on `database` that knows the acting user.
 * A null actor is for the gateway or a scheduler: the audit log then has no actor.
 */
export const runAsActor = async <T>(
  database: Database,
  actorUserId: string | null,
  fn: (tx: Transaction) => Promise<T>
) =>
  await database.transaction(async (tx) => {
    if (actorUserId !== null) {
      await tx.execute(
        sql`select set_config('app.actor_id', ${actorUserId}, true)`
      );
    }
    return await fn(tx);
  });

/**
 * Runs `fn` in a transaction that knows the acting user.
 * The audit trigger reads `app.actor_id` and writes it to `audit_log.actor_user_id`.
 * The setting is local to the transaction, so pooled connections do not keep it.
 */
export const withActor = async <T>(
  actorUserId: string,
  fn: (tx: Transaction) => Promise<T>
) => await runAsActor(db, actorUserId, fn);
