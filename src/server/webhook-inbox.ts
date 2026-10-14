import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";

import type { Transaction } from "@/server/db/client";
import { paymentEvent } from "@/server/db/schema/payments";

export interface InboxEvent {
  /** Provider and account from trusted server configuration. */
  integration: string;
  eventType: string;
  checksum: string;
  payload: unknown;
}

/**
 * Records a received event and gives its row id when the event must be processed.
 * Returns null when the same event (integration and checksum) is already processed.
 * A row with `processed_at` null (needs review or failed) is given again, so a new delivery processes it.
 * The row stays locked until the transaction ends, so two deliveries of one event do not run at the same time.
 */
export const claimEvent = async (tx: Transaction, event: InboxEvent) => {
  const inserted = await tx
    .insert(paymentEvent)
    .values(event)
    .onConflictDoNothing({
      target: [paymentEvent.integration, paymentEvent.checksum],
    })
    .returning({ id: paymentEvent.id });
  const created = inserted.at(0);
  if (created) {
    return created.id;
  }

  const existing = await tx
    .select({ id: paymentEvent.id, processedAt: paymentEvent.processedAt })
    .from(paymentEvent)
    .where(
      and(
        eq(paymentEvent.integration, event.integration),
        eq(paymentEvent.checksum, event.checksum)
      )
    )
    .for("update");
  const row = existing.at(0);
  return row && row.processedAt === null ? row.id : null;
};

export const markEventProcessed = async (tx: Transaction, eventId: string) => {
  await tx
    .update(paymentEvent)
    .set({ processedAt: new Date() })
    .where(eq(paymentEvent.id, eventId));
};
