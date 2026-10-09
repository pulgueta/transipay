import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { checkIn } from "./checks";
import { citizen } from "./citizens";
import { id, timestamps, timestamptz } from "./columns";
import { entity, entityBankAccount } from "./entities";
import { obligation } from "./obligations";

export const AGREEMENT_STATUSES = [
  "active",
  "completed",
  "defaulted",
  "cancelled",
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const INSTALLMENT_STATUSES = ["pending", "paid", "overdue"] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

/** Wompi transaction statuses in lower case. */
export const PAYMENT_STATUSES = [
  "pending",
  "approved",
  "declined",
  "voided",
  "error",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYOUT_STATUSES = [
  "pending",
  "processing",
  "paid",
  "failed",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Splits one obligation into installments. */
export const paymentAgreement = pgTable(
  "payment_agreement",
  {
    id: id(),
    obligationId: uuid()
      .notNull()
      .references(() => obligation.id, { onDelete: "restrict" }),
    installmentCount: smallint().notNull(),
    status: text().$type<AgreementStatus>().notNull().default("active"),
    ...timestamps(),
  },
  (table) => [
    // One active agreement per obligation.
    uniqueIndex("payment_agreement_obligation_id_key")
      .on(table.obligationId)
      .where(sql`${table.status} = 'active'`),
    index("payment_agreement_obligation_id_idx").on(table.obligationId),
    checkIn("payment_agreement_status_check", table.status, AGREEMENT_STATUSES),
    check(
      "payment_agreement_installment_count_check",
      sql`${table.installmentCount} > 0`
    ),
  ]
);

export const installment = pgTable(
  "installment",
  {
    id: id(),
    paymentAgreementId: uuid()
      .notNull()
      .references(() => paymentAgreement.id, { onDelete: "cascade" }),
    number: smallint().notNull(),
    dueOn: date({ mode: "string" }).notNull(),
    amountInCents: bigint({ mode: "number" }).notNull(),
    status: text().$type<InstallmentStatus>().notNull().default("pending"),
    ...timestamps(),
  },
  (table) => [
    unique("installment_payment_agreement_id_number_key").on(
      table.paymentAgreementId,
      table.number
    ),
    checkIn("installment_status_check", table.status, INSTALLMENT_STATUSES),
    check("installment_number_check", sql`${table.number} > 0`),
    check("installment_amount_in_cents_check", sql`${table.amountInCents} > 0`),
  ]
);

/** One payment attempt through the gateway. We only record the result that Wompi reports. */
export const payment = pgTable(
  "payment",
  {
    id: id(),
    citizenId: uuid()
      .notNull()
      .references(() => citizen.id, { onDelete: "restrict" }),
    obligationId: uuid()
      .notNull()
      .references(() => obligation.id, { onDelete: "restrict" }),
    installmentId: uuid().references(() => installment.id, {
      onDelete: "restrict",
    }),
    amountInCents: bigint({ mode: "number" }).notNull(),
    currency: char({ length: 3 }).notNull().default("COP"),
    // Our reference. We send it to Wompi.
    reference: text().notNull().unique("payment_reference_key"),
    provider: text().notNull().default("wompi"),
    providerTransactionId: text().unique("payment_provider_transaction_id_key"),
    paymentMethodType: text(),
    status: text().$type<PaymentStatus>().notNull().default("pending"),
    receiptNumber: text().unique("payment_receipt_number_key"),
    finalizedAt: timestamptz(),
    ...timestamps(),
  },
  (table) => [
    index("payment_citizen_id_id_idx").on(table.citizenId, table.id),
    index("payment_obligation_id_idx").on(table.obligationId),
    index("payment_installment_id_idx").on(table.installmentId),
    checkIn("payment_status_check", table.status, PAYMENT_STATUSES),
    check("payment_amount_in_cents_check", sql`${table.amountInCents} > 0`),
    // A payment gets a final time only when it leaves 'pending'.
    check(
      "payment_finalized_at_check",
      sql`(${table.status} = 'pending') = (${table.finalizedAt} is null)`
    ),
  ]
);

/** Ledger of gateway webhooks. The unique checksum makes event processing idempotent. */
export const paymentEvent = pgTable("payment_event", {
  id: id(),
  provider: text().notNull().default("wompi"),
  eventType: text().notNull(),
  // Signature checksum that Wompi sends with each event.
  checksum: text().notNull().unique("payment_event_checksum_key"),
  payload: jsonb().notNull(),
  receivedAt: timestamptz().notNull().defaultNow(),
  processedAt: timestamptz(),
});

/** Dispersion of collected money to an entity through Wompi payouts. */
export const payout = pgTable(
  "payout",
  {
    id: id(),
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    entityBankAccountId: uuid()
      .notNull()
      .references(() => entityBankAccount.id, { onDelete: "restrict" }),
    amountInCents: bigint({ mode: "number" }).notNull(),
    currency: char({ length: 3 }).notNull().default("COP"),
    reference: text().notNull().unique("payout_reference_key"),
    idempotencyKey: text().notNull().unique("payout_idempotency_key_key"),
    providerPayoutId: text().unique("payout_provider_payout_id_key"),
    status: text().$type<PayoutStatus>().notNull().default("pending"),
    finalizedAt: timestamptz(),
    ...timestamps(),
  },
  (table) => [
    index("payout_entity_id_id_idx").on(table.entityId, table.id),
    index("payout_entity_bank_account_id_idx").on(table.entityBankAccountId),
    checkIn("payout_status_check", table.status, PAYOUT_STATUSES),
    check("payout_amount_in_cents_check", sql`${table.amountInCents} > 0`),
    check(
      "payout_finalized_at_check",
      sql`(${table.status} in ('paid', 'failed')) = (${table.finalizedAt} is not null)`
    ),
  ]
);
