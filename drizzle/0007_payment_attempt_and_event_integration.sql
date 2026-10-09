CREATE TABLE "payment_attempt" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"payment_id" uuid NOT NULL,
	"provider_transaction_id" text NOT NULL,
	"status" text NOT NULL,
	"amount_in_cents" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payment_method_type" text,
	"review_reason" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_attempt_provider_transaction_id_key" UNIQUE("provider_transaction_id"),
	CONSTRAINT "payment_attempt_status_check" CHECK ("payment_attempt"."status" in ('pending', 'approved', 'declined', 'voided', 'error')),
	CONSTRAINT "payment_attempt_review_reason_check" CHECK ("payment_attempt"."review_reason" in ('second_approval', 'target_not_payable')),
	CONSTRAINT "payment_attempt_amount_in_cents_check" CHECK ("payment_attempt"."amount_in_cents" > 0),
	CONSTRAINT "payment_attempt_finalized_at_check" CHECK (("payment_attempt"."status" = 'pending') = ("payment_attempt"."finalized_at" is null))
);
--> statement-breakpoint
ALTER TABLE "payment_event" DROP CONSTRAINT "payment_event_checksum_key";--> statement-breakpoint
-- Events received before this change have no known account. They get the value 'wompi:legacy'.
ALTER TABLE "payment_event" ADD COLUMN "integration" text DEFAULT 'wompi:legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_event" ALTER COLUMN "integration" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD CONSTRAINT "payment_attempt_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_attempt_payment_id_idx" ON "payment_attempt" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "payment_event" ADD CONSTRAINT "payment_event_integration_checksum_key" UNIQUE("integration","checksum");