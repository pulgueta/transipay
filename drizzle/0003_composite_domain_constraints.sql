-- Composite domain constraints. Each ownership rule is one composite foreign key.
-- The parent gets UNIQUE (id, owner_id) before the child foreign key, because a foreign key needs a unique target.
ALTER TABLE "obligation" DROP CONSTRAINT "obligation_amount_in_cents_check";--> statement-breakpoint
ALTER TABLE "notification" DROP CONSTRAINT "notification_obligation_id_obligation_id_fk";--> statement-breakpoint
ALTER TABLE "procedure" DROP CONSTRAINT "procedure_procedure_type_id_procedure_type_id_fk";--> statement-breakpoint
ALTER TABLE "installment" DROP CONSTRAINT "installment_payment_agreement_id_payment_agreement_id_fk";--> statement-breakpoint
ALTER TABLE "payment" DROP CONSTRAINT "payment_installment_id_installment_id_fk";--> statement-breakpoint
ALTER TABLE "payout" DROP CONSTRAINT "payout_entity_bank_account_id_entity_bank_account_id_fk";--> statement-breakpoint
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_branch_id_branch_id_fk";--> statement-breakpoint
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_procedure_type_id_procedure_type_id_fk";--> statement-breakpoint
ALTER TABLE "appointment" DROP CONSTRAINT "appointment_obligation_id_obligation_id_fk";--> statement-breakpoint
ALTER TABLE "course_enrollment" DROP CONSTRAINT "course_enrollment_obligation_id_obligation_id_fk";--> statement-breakpoint
ALTER TABLE "course_session" DROP CONSTRAINT "course_session_branch_id_branch_id_fk";--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_id_entity_id_key" UNIQUE("id","entity_id");--> statement-breakpoint
ALTER TABLE "entity_bank_account" ADD CONSTRAINT "entity_bank_account_id_entity_id_key" UNIQUE("id","entity_id");--> statement-breakpoint
ALTER TABLE "obligation" ADD CONSTRAINT "obligation_id_citizen_id_key" UNIQUE("id","citizen_id");--> statement-breakpoint
ALTER TABLE "obligation" ADD CONSTRAINT "obligation_id_entity_id_key" UNIQUE("id","entity_id");--> statement-breakpoint
ALTER TABLE "procedure_type" ADD CONSTRAINT "procedure_type_id_entity_id_key" UNIQUE("id","entity_id");--> statement-breakpoint
ALTER TABLE "payment_agreement" ADD CONSTRAINT "payment_agreement_id_obligation_id_key" UNIQUE("id","obligation_id");--> statement-breakpoint
-- New owner columns: add them, copy the owner from the parent row, then make them NOT NULL.
ALTER TABLE "procedure" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
UPDATE "procedure" SET "entity_id" = "obligation"."entity_id" FROM "obligation" WHERE "obligation"."id" = "procedure"."obligation_id";--> statement-breakpoint
ALTER TABLE "procedure" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "installment" ADD COLUMN "obligation_id" uuid;--> statement-breakpoint
UPDATE "installment" SET "obligation_id" = "payment_agreement"."obligation_id" FROM "payment_agreement" WHERE "payment_agreement"."id" = "installment"."payment_agreement_id";--> statement-breakpoint
ALTER TABLE "installment" ALTER COLUMN "obligation_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_id_obligation_id_key" UNIQUE("id","obligation_id");--> statement-breakpoint
ALTER TABLE "appointment" ADD COLUMN "entity_id" uuid;--> statement-breakpoint
UPDATE "appointment" SET "entity_id" = "branch"."entity_id" FROM "branch" WHERE "branch"."id" = "appointment"."branch_id";--> statement-breakpoint
ALTER TABLE "appointment" ALTER COLUMN "entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "course_enrollment" ADD COLUMN "obligation_kind" text GENERATED ALWAYS AS ('fine') STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_obligation_id_citizen_id_fkey" FOREIGN KEY ("obligation_id","citizen_id") REFERENCES "public"."obligation"("id","citizen_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_obligation_id_entity_id_fkey" FOREIGN KEY ("obligation_id","entity_id") REFERENCES "public"."obligation"("id","entity_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_procedure_type_id_entity_id_fkey" FOREIGN KEY ("procedure_type_id","entity_id") REFERENCES "public"."procedure_type"("id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_payment_agreement_id_obligation_id_fkey" FOREIGN KEY ("payment_agreement_id","obligation_id") REFERENCES "public"."payment_agreement"("id","obligation_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_installment_id_obligation_id_fkey" FOREIGN KEY ("installment_id","obligation_id") REFERENCES "public"."installment"("id","obligation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_entity_bank_account_id_entity_id_fkey" FOREIGN KEY ("entity_bank_account_id","entity_id") REFERENCES "public"."entity_bank_account"("id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_branch_id_entity_id_fkey" FOREIGN KEY ("branch_id","entity_id") REFERENCES "public"."branch"("id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_procedure_type_id_entity_id_fkey" FOREIGN KEY ("procedure_type_id","entity_id") REFERENCES "public"."procedure_type"("id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_obligation_id_citizen_id_fkey" FOREIGN KEY ("obligation_id","citizen_id") REFERENCES "public"."obligation"("id","citizen_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollment" ADD CONSTRAINT "course_enrollment_obligation_id_citizen_id_fkey" FOREIGN KEY ("obligation_id","citizen_id") REFERENCES "public"."obligation"("id","citizen_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollment" ADD CONSTRAINT "course_enrollment_obligation_id_obligation_kind_fkey" FOREIGN KEY ("obligation_id","obligation_kind") REFERENCES "public"."obligation"("id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_session" ADD CONSTRAINT "course_session_branch_id_entity_id_fkey" FOREIGN KEY ("branch_id","entity_id") REFERENCES "public"."branch"("id","entity_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation" ADD CONSTRAINT "obligation_amount_in_cents_check" CHECK ("obligation"."amount_in_cents" > 0 or ("obligation"."kind" = 'procedure' and "obligation"."amount_in_cents" = 0));
