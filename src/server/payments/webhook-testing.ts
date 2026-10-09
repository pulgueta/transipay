import type { Transaction } from "@pulgueta/wompi/schemas";
import { computeEventChecksum } from "@pulgueta/wompi/server";
import { z } from "zod";

export const TEST_EVENTS_KEY = "test_events_key";

const eventBody = z.looseObject({
  event: z.string(),
  data: z.record(z.string(), z.record(z.string(), z.unknown())),
});

/**
 * Changes a signed event body and keeps its checksum.
 * Use it only for fields that the signature does not cover: the result is a changed copy that still verifies.
 */
export const editEventBody = (
  body: string,
  edit: (event: z.infer<typeof eventBody>) => void
) => {
  const event = eventBody.parse(JSON.parse(body));
  edit(event);
  return JSON.stringify(event);
};

export const TEST_INTEGRATION = "wompi:pub_test_transipay";

/**
 * Makes a `transaction.updated` body that Wompi signed with `TEST_EVENTS_KEY`.
 * The body has a reference and an amount that are not ours: only the signed id must be used.
 */
export const signedTransactionEvent = async (
  transaction: Pick<Transaction, "id" | "status">,
  options: { properties?: string[]; timestamp?: number } = {}
) => {
  const event = {
    event: "transaction.updated",
    data: {
      transaction: {
        reference: "tp_event_body",
        amount_in_cents: 100,
        currency: "COP",
        ...transaction,
      },
    },
    environment: "test",
    signature: {
      properties: options.properties ?? [
        "transaction.id",
        "transaction.status",
        "transaction.amount_in_cents",
      ],
      checksum: "",
    },
    timestamp: options.timestamp ?? 1_760_000_000,
    sent_at: "2026-10-08T12:00:00.000Z",
  };
  const checksum = await computeEventChecksum(event, TEST_EVENTS_KEY);
  return {
    checksum,
    body: JSON.stringify({
      ...event,
      signature: { ...event.signature, checksum },
    }),
  };
};
