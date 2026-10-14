import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";

import { checkIn } from "./checks";
import { id, timestamptz } from "./columns";

export const AUDIT_ACTIONS = ["insert", "update", "delete"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Append-only change log. The trigger `public.audit_row_change()` writes it (see the audit_trigger migration).
 * `actor_user_id` has no foreign key: the audit trail must stay after a user is deleted.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    occurredAt: timestamptz().notNull().defaultNow(),
    actorUserId: uuid(),
    action: text().$type<AuditAction>().notNull(),
    tableName: text().notNull(),
    recordId: uuid().notNull(),
    oldData: jsonb(),
    newData: jsonb(),
  },
  (table) => [
    index("audit_log_occurred_at_idx").using("brin", table.occurredAt),
    index("audit_log_table_name_record_id_idx").on(
      table.tableName,
      table.recordId
    ),
    checkIn("audit_log_action_check", table.action, AUDIT_ACTIONS),
  ]
);
