-- The origin account is part of the payout command: public.payout_command (0009) takes every column that is not in
-- its exclusion list, so the trigger payout_keep_command refuses a change after the payout left draft.
-- A payout queued before this migration keeps its command hash (computed without this column) and a null origin account.
-- The dispatcher never sends such a payout; the sweep marks it for staff with review_reason 'origin_account_missing'.
ALTER TABLE "payout" DROP CONSTRAINT "payout_review_reason_check";--> statement-breakpoint
ALTER TABLE "payout" DROP CONSTRAINT "payout_review_reason_status_check";--> statement-breakpoint
ALTER TABLE "payout" ADD COLUMN "origin_account_id" text;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_origin_account_check" CHECK ("payout"."status" <> 'submitting' or "payout"."origin_account_id" is not null);--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_review_reason_check" CHECK ("payout"."review_reason" in ('not_found_after_deadline', 'origin_account_missing'));--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_review_reason_status_check" CHECK ("payout"."review_reason" is null or "payout"."status" in ('queued', 'uncertain'));