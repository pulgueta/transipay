ALTER TABLE "payout" DROP CONSTRAINT "payout_status_check";--> statement-breakpoint
ALTER TABLE "payout" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "bank_id" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "account_type" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "account_number" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "holder_name" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "holder_legal_id_type" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "holder_legal_id" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "command_hash" text;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "first_dispatch_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "retry_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "review_reason" text;--> statement-breakpoint
-- The command of a payout: all columns except the ones that the state machine changes.
-- A new column is part of the command until you add it to this list (see also payout_keep_command in 0010).
CREATE FUNCTION public.payout_command(p public.payout) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT to_jsonb(p) - ARRAY[
    'status', 'provider_payout_id', 'review_reason', 'finalized_at', 'first_dispatch_at',
    'retry_deadline', 'lease_token', 'lease_expires_at', 'command_hash', 'created_at', 'updated_at'
  ]
$$;
--> statement-breakpoint
CREATE FUNCTION public.payout_command_hash(p public.payout) RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT encode(sha256(convert_to(public.payout_command(p)::text, 'UTF8')), 'hex')
$$;
--> statement-breakpoint
-- Data migration for the payouts that exist before the state machine. Old status -> new status:
--   pending without a Wompi payout id -> uncertain: the send result is not known (lost response, timeout, 5xx).
--     Reconciliation asks Wompi. It sends again only before the retry deadline.
--   pending with a Wompi payout id, and processing -> submitted: Wompi accepted the payout.
--   paid -> paid, failed -> failed.
-- The old code sent the account in entity_bank_account_id and the entity email right after the insert.
-- Thus they are the snapshot, created_at is the first dispatch, and the retry deadline is 23 hours later.
UPDATE public.payout AS p SET
  status = CASE
    WHEN p.status = 'processing' OR (p.status = 'pending' AND p.provider_payout_id IS NOT NULL) THEN 'submitted'
    WHEN p.status = 'pending' THEN 'uncertain'
    ELSE p.status
  END,
  bank_id = a.bank_id,
  account_type = a.account_type,
  account_number = a.account_number,
  holder_name = a.holder_name,
  holder_legal_id_type = a.holder_legal_id_type,
  holder_legal_id = a.holder_legal_id,
  recipient_email = e.email,
  first_dispatch_at = p.created_at,
  retry_deadline = p.created_at + interval '23 hours'
FROM public.entity_bank_account AS a, public.entity AS e
WHERE a.id = p.entity_bank_account_id AND e.id = p.entity_id;
--> statement-breakpoint
UPDATE public.payout AS p SET command_hash = public.payout_command_hash(p);
--> statement-breakpoint
CREATE INDEX "payout_open_status_id_idx" ON "payout" USING btree ("status","id") WHERE "payout"."status" in ('queued', 'submitting', 'submitted', 'uncertain');--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_account_type_check" CHECK ("payout"."account_type" in ('AHORROS', 'CORRIENTE', 'DEPOSITO_ELECTRONICO'));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_holder_legal_id_type_check" CHECK ("payout"."holder_legal_id_type" in ('CC', 'NIT', 'PP', 'CE', 'TI', 'DNI'));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_review_reason_check" CHECK ("payout"."review_reason" in ('not_found_after_deadline'));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_command_check" CHECK ("payout"."status" = 'draft' or ("payout"."bank_id" is not null and "payout"."account_type" is not null
        and "payout"."account_number" is not null and "payout"."holder_name" is not null
        and "payout"."holder_legal_id_type" is not null and "payout"."holder_legal_id" is not null
        and "payout"."recipient_email" is not null and "payout"."command_hash" is not null));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_dispatch_check" CHECK (("payout"."status" not in ('submitting', 'submitted', 'uncertain') or "payout"."first_dispatch_at" is not null)
        and (("payout"."first_dispatch_at" is null) = ("payout"."retry_deadline" is null)));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_lease_check" CHECK (("payout"."status" = 'submitting') = ("payout"."lease_token" is not null and "payout"."lease_expires_at" is not null));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_review_reason_status_check" CHECK ("payout"."review_reason" is null or "payout"."status" = 'uncertain');--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_status_check" CHECK ("payout"."status" in ('draft', 'queued', 'submitting', 'submitted', 'uncertain', 'paid', 'failed'));