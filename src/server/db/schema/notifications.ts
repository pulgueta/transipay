import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { checkIn } from "./checks";
import { citizen } from "./citizens";
import { id, timestamps, timestamptz } from "./columns";
import { obligation } from "./obligations";

export const NOTIFICATION_CHANNELS = ["email", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ["queued", "sent", "failed"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Record of each message to a citizen. It is legal evidence, so a citizen with notifications cannot be deleted. */
export const notification = pgTable(
  "notification",
  {
    id: id(),
    citizenId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "restrict" }),
    // Optional. When it is set, the obligation belongs to the recipient citizen (see the foreign key below).
    obligationId: uuid(),
    channel: text().$type<NotificationChannel>().notNull(),
    template: text().notNull(),
    // SMS messages have no subject.
    subject: text(),
    body: text().notNull(),
    status: text().$type<NotificationStatus>().notNull().default("queued"),
    sentAt: timestamptz(),
    ...timestamps(),
  },
  (table) => [
    index("notification_citizen_id_id_idx").on(table.citizenId, table.id),
    index("notification_obligation_id_idx").on(table.obligationId),
    // RESTRICT, not SET NULL: SET NULL also clears citizen_id, and the obligation is part of the evidence.
    foreignKey({
      name: "notification_obligation_id_citizen_id_fkey",
      columns: [table.obligationId, table.citizenId],
      foreignColumns: [obligation.id, obligation.citizenId],
    }).onDelete("restrict"),
    checkIn("notification_channel_check", table.channel, NOTIFICATION_CHANNELS),
    checkIn("notification_status_check", table.status, NOTIFICATION_STATUSES),
    check(
      "notification_sent_at_check",
      sql`(${table.status} = 'sent') = (${table.sentAt} is not null)`
    ),
  ]
);
