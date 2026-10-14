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
import {
  BANK_ACCOUNT_TYPES,
  HOLDER_LEGAL_ID_TYPES,
  entity,
  entityBankAccount,
} from "./entities";
import type { BankAccountType, HolderLegalIdType } from "./entities";
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

/** Wompi transaction statuses in lower case. An attempt has only these statuses. */
export const PAYMENT_ATTEMPT_STATUSES = [
  "pending",
  "approved",
  "declined",
  "voided",
  "error",
] as const;
export type PaymentAttemptStatus = (typeof PAYMENT_ATTEMPT_STATUSES)[number];

/**
 * The attempt statuses, plus `expired`: the checkout link expired and Wompi has no transaction for it.
 * A late transaction can still move an expired payment (see `resolveTransactionUpdate`).
 */
export const PAYMENT_STATUSES = [
  ...PAYMENT_ATTEMPT_STATUSES,
  "expired",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * The payout row is the queue (see docs/architecture/remediation.md, "Payouts").
 * draft -> queued -> submitting -> submitted -> paid | failed.
 * An unknown send result or an expired lease gives uncertain. Only reconciliation moves an uncertain payout.
 */
export const PAYOUT_STATUSES = [
  "draft",
  "queued",
  "submitting",
  "submitted",
  "uncertain",
  "paid",
  "failed",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/** Why staff must examine an uncertain payout. The payout is not sent again until staff decide. */
export const PAYOUT_REVIEW_REASONS = [
  // Wompi has no transaction for the reference, and the retry deadline is in the past.
  "not_found_after_deadline",
] as const;
export type PayoutReviewReason = (typeof PAYOUT_REVIEW_REASONS)[number];

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
    // The scheduled sweep reads the pending payments in id order.
    index("payment_pending_id_idx")
      .on(table.id)
      .where(sql`${table.status} = 'pending'`),
    // The sweep and the checkout read the payments that left 'pending' inside the settle window (see `canStillSettle`).
    index("payment_unsettled_created_at_idx")
      .on(table.createdAt)
      .where(
        sql`${table.status} in ('declined', 'voided', 'error', 'expired')`
      ),
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
    status: text().$type<PaymentAttemptStatus>().notNull(),
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
    checkIn(
      "payment_attempt_status_check",
      table.status,
      PAYMENT_ATTEMPT_STATUSES
    ),
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
 * A row is a receipt. The trigger `payment_event_keep_receipt` refuses a delete and a change to a column other than
 * `processed_at`. `processed_at` is written one time.
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

/**
 * Dispersion of collected money to an entity through Wompi payouts.
 * When a payout leaves 'draft', its command (entity, account, amount, reference, key, and the bank account snapshot)
 * cannot change. The trigger `payout_keep_command` enforces this and writes `command_hash`.
 * A send uses only the snapshot, never the current entity or bank account rows.
 */
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
    // Snapshot of the bank account and the entity email when the payout was queued.
    bankId: text(),
    accountType: text().$type<BankAccountType>(),
    accountNumber: text(),
    holderName: text(),
    holderLegalIdType: text().$type<HolderLegalIdType>(),
    holderLegalId: text(),
    recipientEmail: text(),
    // SHA-256 of the command. The database writes it when the payout leaves 'draft'.
    commandHash: text(),
    // Set by the database on the first claim. Wompi keeps an idempotency key for 24 hours,
    // so a send with the same key is safe only before `retry_deadline` (first dispatch plus 23 hours).
    firstDispatchAt: timestamptz(),
    retryDeadline: timestamptz(),
    // The dispatcher that holds a 'submitting' payout, and the time its claim ends.
    leaseToken: uuid(),
    leaseExpiresAt: timestamptz(),
    providerPayoutId: text().unique("payout_provider_payout_id_key"),
    status: text().$type<PayoutStatus>().notNull().default("draft"),
    // Not null when staff must examine the payout.
    reviewReason: text().$type<PayoutReviewReason>(),
    // The next time that reconciliation asks Wompi about this payout. Null when the payout is not 'uncertain' or 'submitted'.
    // The trigger `payout_schedule_reconcile` sets it when the status changes. Reconciliation moves it after each lookup.
    nextReconcileAt: timestamptz(),
    finalizedAt: timestamptz(),
    ...timestamps(),
  },
  (table) => [
    index("payout_entity_id_id_idx").on(table.entityId, table.id),
    index("payout_entity_bank_account_id_idx").on(table.entityBankAccountId),
    // The dispatcher reads the open payouts in id order.
    index("payout_open_status_id_idx")
      .on(table.status, table.id)
      .where(
        sql`${table.status} in ('queued', 'submitting', 'submitted', 'uncertain')`
      ),
    // The reconciliation reads the due payouts in schedule order.
    index("payout_next_reconcile_at_idx")
      .on(table.nextReconcileAt)
      .where(sql`${table.nextReconcileAt} is not null`),
    foreignKey({
      name: "payout_entity_bank_account_id_entity_id_fkey",
      columns: [table.entityBankAccountId, table.entityId],
      foreignColumns: [entityBankAccount.id, entityBankAccount.entityId],
    }).onDelete("restrict"),
    checkIn("payout_status_check", table.status, PAYOUT_STATUSES),
    checkIn("payout_account_type_check", table.accountType, BANK_ACCOUNT_TYPES),
    checkIn(
      "payout_holder_legal_id_type_check",
      table.holderLegalIdType,
      HOLDER_LEGAL_ID_TYPES
    ),
    checkIn(
      "payout_review_reason_check",
      table.reviewReason,
      PAYOUT_REVIEW_REASONS
    ),
    check("payout_amount_in_cents_check", sql`${table.amountInCents} > 0`),
    check(
      "payout_finalized_at_check",
      sql`(${table.status} in ('paid', 'failed')) = (${table.finalizedAt} is not null)`
    ),
    // Only a draft can have an incomplete command.
    check(
      "payout_command_check",
      sql`${table.status} = 'draft' or (${table.bankId} is not null and ${table.accountType} is not null
        and ${table.accountNumber} is not null and ${table.holderName} is not null
        and ${table.holderLegalIdType} is not null and ${table.holderLegalId} is not null
        and ${table.recipientEmail} is not null and ${table.commandHash} is not null)`
    ),
    // A payout that was sent at least one time has a first dispatch and a retry deadline.
    check(
      "payout_dispatch_check",
      sql`(${table.status} not in ('submitting', 'submitted', 'uncertain') or ${table.firstDispatchAt} is not null)
        and ((${table.firstDispatchAt} is null) = (${table.retryDeadline} is null))`
    ),
    // Only a 'submitting' payout has a lease.
    check(
      "payout_lease_check",
      sql`(${table.status} = 'submitting') = (${table.leaseToken} is not null and ${table.leaseExpiresAt} is not null)`
    ),
    check(
      "payout_review_reason_status_check",
      sql`${table.reviewReason} is null or ${table.status} = 'uncertain'`
    ),
  ]
);
