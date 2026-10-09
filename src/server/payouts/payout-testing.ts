import { randomUUID } from "node:crypto";

import type { Payout, PayoutEventTransaction } from "@pulgueta/wompi/schemas";
import { computeEventChecksum } from "@pulgueta/wompi/server";
import type { Pool } from "pg";

export const TEST_PAYOUT_EVENTS_KEY = "test_payout_events_key";

export const TEST_PAYOUT_INTEGRATION = "wompi-payouts:principal_test";

/**
 * Makes a payouts event body that Wompi signed with `TEST_PAYOUT_EVENTS_KEY`.
 * The body has a reference that is not ours: only the signed payout id must be used.
 */
export const signedPayoutEvent = async (
  data:
    | { payout: Payout }
    | {
        transaction: Pick<PayoutEventTransaction, "id" | "payoutId" | "status">;
      },
  options: { event?: string; properties?: string[]; timestamp?: number } = {}
) => {
  const event = {
    event: options.event ?? "payout.updated",
    data,
    signature: {
      properties: options.properties ?? [
        "payout.id",
        "payout.status",
        "payout.amountInCents",
      ],
      checksum: "",
    },
    timestamp: options.timestamp ?? 1_760_000_000,
    sentAt: "2026-10-08T12:00:00.000Z",
  };
  const checksum = await computeEventChecksum(event, TEST_PAYOUT_EVENTS_KEY);
  return {
    checksum,
    body: JSON.stringify({
      ...event,
      signature: { ...event.signature, checksum },
    }),
  };
};

export const unique = () => randomUUID().replaceAll("-", "").slice(0, 12);

const queryId = async (pool: Pool, text: string, values: unknown[]) => {
  const result = await pool.query<{ id: string }>(text, values);
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The insert returned no row.");
  }
  return row.id;
};

/** Makes an active entity with a default bank account. */
export const seedEntity = async (pool: Pool) => {
  const entityId = await queryId(
    pool,
    `insert into entity (kind, name, tax_id, email, phone)
     values ('cda', 'CDA', $1, 'pagos@cda.example.com', '3000000000') returning id`,
    [unique()]
  );
  const bankAccountId = await queryId(
    pool,
    `insert into entity_bank_account
       (entity_id, bank_id, account_type, account_number, holder_name, holder_legal_id_type, holder_legal_id, is_default)
     values ($1, '1007', 'CORRIENTE', $2, 'CDA SAS', 'NIT', '900123456', true) returning id`,
    [entityId, unique()]
  );
  return { entityId, bankAccountId };
};

/**
 * Inserts a payout with a full command. `firstDispatchAgo` sets the first dispatch in the past,
 * as for a payout that was sent before.
 */
export const insertPayout = async (
  pool: Pool,
  input: {
    entityId: string;
    bankAccountId: string;
    status: string;
    firstDispatchAgo?: string;
    providerPayoutId?: string;
  }
) => {
  const reference = `tp_po_${unique()}`;
  const id = await queryId(
    pool,
    `insert into payout
       (entity_id, entity_bank_account_id, amount_in_cents, reference, idempotency_key, status,
        bank_id, account_type, account_number, holder_name, holder_legal_id_type, holder_legal_id,
        recipient_email, first_dispatch_at, provider_payout_id, finalized_at)
     values ($1, $2, 5000000, $3, $4, $5, '1007', 'CORRIENTE', '123456789', 'CDA SAS', 'NIT', '900123456',
       'pagos@cda.example.com', now() - $6::interval, $7,
       case when $5 in ('paid', 'failed') then now() end)
     returning id`,
    [
      input.entityId,
      input.bankAccountId,
      reference,
      unique(),
      input.status,
      input.firstDispatchAgo ?? null,
      input.providerPayoutId ?? null,
    ]
  );
  return { id, reference };
};

export const payoutRow = async (pool: Pool, id: string) => {
  const result = await pool.query<{
    status: string;
    provider_payout_id: string | null;
    review_reason: string | null;
    lease_token: string | null;
    command_hash: string | null;
    first_dispatch_at: Date | null;
    retry_deadline: Date | null;
  }>(
    `select status, provider_payout_id, review_reason, lease_token, command_hash,
            first_dispatch_at, retry_deadline
     from payout where id = $1`,
    [id]
  );
  const row = result.rows.at(0);
  if (!row) {
    throw new Error("The payout is missing.");
  }
  return row;
};
