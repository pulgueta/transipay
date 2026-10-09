import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
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
    // Target of the ownership foreign key: an installment keeps the obligation of its agreement.
    unique("payment_agreement_id_obligation_id_key").on(
      table.id,
      table.obligationId
    ),
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
    paymentAgreementId: uuid().notNull(),
    // The obligation of the agreement. A payment uses it to refer to an installment of its own obligation.
    obligationId: uuid().notNull(),
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
    foreignKey({
      name: "installment_payment_agreement_id_obligation_id_fkey",
      columns: [table.paymentAgreementId, table.obligationId],
      foreignColumns: [paymentAgreement.id, paymentAgreement.obligationId],
    }).onDelete("cascade"),
    // Target of the ownership foreign key from payment.
    unique("installment_id_obligation_id_key").on(table.id, table.obligationId),
    checkIn("installment_status_check", table.status, INSTALLMENT_STATUSES),
    check("installment_number_check", sql`${table.number} > 0`),
    check("installment_amount_in_cents_check", sql`${table.amountInCents} > 0`),
  ]
);

/**
 * One payment intent for an obligation or an installment. Its attempts (`payment_attempt`) are the Wompi transactions.
 * `provider_transaction_id` is the attempt that set the current status.
 */
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
    // Optional. When it is set, the installment belongs to this obligation (see the foreign key below).
    installmentId: uuid(),
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
    // MATCH SIMPLE: a payment without an installment skips this check.
    foreignKey({
      name: "payment_installment_id_obligation_id_fkey",
      columns: [table.installmentId, table.obligationId],
      foreignColumns: [installment.id, installment.obligationId],
    }).onDelete("restrict"),
    checkIn("payment_status_check", table.status, PAYMENT_STATUSES),
    check("payment_amount_in_cents_check", sql`${table.amountInCents} > 0`),
    // A payment gets a final time only when it leaves 'pending'.
    check(
      "payment_finalized_at_check",
      sql`(${table.status} = 'pending') = (${table.finalizedAt} is null)`
    ),
  ]
);

/** Why staff must examine an attempt. The money effect waits for their decision. */
export const PAYMENT_ATTEMPT_REVIEW_REASONS = [
  // A second transaction is approved for a payment that is approved (possible overpayment).
  "second_approval",
  // The transaction is approved, but the obligation or installment is not payable now (possible refund).
  "target_not_payable",
] as const;
export type PaymentAttemptReviewReason =
  (typeof PAYMENT_ATTEMPT_REVIEW_REASONS)[number];

/**
 * One Wompi transaction for a payment. Wompi can use the payment reference again
 * for a new transaction after a decline, so one payment can have more than one attempt.
 * The unique transaction id makes a money effect happen at most one time.
 */
export const paymentAttempt = pgTable(
  "payment_attempt",
  {
    id: id(),
    paymentId: uuid()
      .notNull()
      .references(() => payment.id, { onDelete: "restrict" }),
    providerTransactionId: text()
      .notNull()
      .unique("payment_attempt_provider_transaction_id_key"),
    status: text().$type<PaymentStatus>().notNull(),
    amountInCents: bigint({ mode: "number" }).notNull(),
    currency: char({ length: 3 }).notNull(),
    paymentMethodType: text(),
    // Not null when staff must examine the attempt.
    reviewReason: text().$type<PaymentAttemptReviewReason>(),
    finalizedAt: timestamptz(),
    ...timestamps(),
  },
  (table) => [
    index("payment_attempt_payment_id_idx").on(table.paymentId),
    checkIn("payment_attempt_status_check", table.status, PAYMENT_STATUSES),
    checkIn(
      "payment_attempt_review_reason_check",
      table.reviewReason,
      PAYMENT_ATTEMPT_REVIEW_REASONS
    ),
    check(
      "payment_attempt_amount_in_cents_check",
      sql`${table.amountInCents} > 0`
    ),
    check(
      "payment_attempt_finalized_at_check",
      sql`(${table.status} = 'pending') = (${table.finalizedAt} is null)`
    ),
  ]
);

/**
 * Inbox of gateway webhooks, for payments and payouts.
 * `integration` names the account that signed the event. The unique (integration, checksum) drops a repeated delivery.
 * A row with `processed_at` null needs review or failed. A new delivery of that event processes it again.
 */
export const paymentEvent = pgTable(
  "payment_event",
  {
    id: id(),
    provider: text().notNull().default("wompi"),
    // Provider and account, from trusted server configuration. Never from the event body.
    integration: text().notNull(),
    eventType: text().notNull(),
    // Signature checksum that Wompi sends with each event.
    checksum: text().notNull(),
    payload: jsonb().notNull(),
    receivedAt: timestamptz().notNull().defaultNow(),
    processedAt: timestamptz(),
  },
  (table) => [
    unique("payment_event_integration_checksum_key").on(
      table.integration,
      table.checksum
    ),
  ]
);

/** Dispersion of collected money to an entity through Wompi payouts. */
export const payout = pgTable(
  "payout",
  {
    id: id(),
    entityId: uuid()
      .notNull()
      .references(() => entity.id, { onDelete: "restrict" }),
    // The account belongs to the payout entity (see the foreign key below).
    entityBankAccountId: uuid().notNull(),
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
    foreignKey({
      name: "payout_entity_bank_account_id_entity_id_fkey",
      columns: [table.entityBankAccountId, table.entityId],
      foreignColumns: [entityBankAccount.id, entityBankAccount.entityId],
    }).onDelete("restrict"),
    checkIn("payout_status_check", table.status, PAYOUT_STATUSES),
    check("payout_amount_in_cents_check", sql`${table.amountInCents} > 0`),
    check(
      "payout_finalized_at_check",
      sql`(${table.status} in ('paid', 'failed')) = (${table.finalizedAt} is not null)`
    ),
  ]
);
