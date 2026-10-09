CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"old_data" jsonb,
	"new_data" jsonb,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" in ('insert', 'update', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_id_account_id_key" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'citizen' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citizen" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid,
	"document_type" text NOT NULL,
	"document_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "citizen_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "citizen_document_type_document_number_key" UNIQUE("document_type","document_number"),
	CONSTRAINT "citizen_document_type_check" CHECK ("citizen"."document_type" in ('CC', 'CE', 'TI', 'PP', 'NIT', 'PEP'))
);
--> statement-breakpoint
CREATE TABLE "driver_license" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"citizen_id" uuid NOT NULL,
	"number" text NOT NULL,
	"category" text NOT NULL,
	"issued_on" date NOT NULL,
	"expires_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_license_number_key" UNIQUE("number"),
	CONSTRAINT "driver_license_citizen_id_category_key" UNIQUE("citizen_id","category"),
	CONSTRAINT "driver_license_category_check" CHECK ("driver_license"."category" in ('A1', 'A2', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3')),
	CONSTRAINT "driver_license_expires_on_check" CHECK ("driver_license"."expires_on" > "driver_license"."issued_on")
);
--> statement-breakpoint
CREATE TABLE "vehicle" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"vehicle_type" text NOT NULL,
	"service_type" text NOT NULL,
	"brand" text NOT NULL,
	"line" text NOT NULL,
	"model_year" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_plate_key" UNIQUE("plate"),
	CONSTRAINT "vehicle_plate_check" CHECK ("vehicle"."plate" = upper("vehicle"."plate")),
	CONSTRAINT "vehicle_vehicle_type_check" CHECK ("vehicle"."vehicle_type" in ('car', 'motorcycle', 'truck', 'bus', 'van', 'other')),
	CONSTRAINT "vehicle_service_type_check" CHECK ("vehicle"."service_type" in ('private', 'public', 'official'))
);
--> statement-breakpoint
CREATE TABLE "vehicle_document" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"issuer_entity_id" uuid,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_document_kind_check" CHECK ("vehicle_document"."kind" in ('soat', 'technical_inspection')),
	CONSTRAINT "vehicle_document_valid_until_check" CHECK ("vehicle_document"."valid_until" >= "vehicle_document"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "branch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text DEFAULT 'Barrancabermeja' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_entity_id_name_key" UNIQUE("entity_id","name")
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"tax_id" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_tax_id_key" UNIQUE("tax_id"),
	CONSTRAINT "entity_kind_check" CHECK ("entity"."kind" in ('transit_authority', 'cda', 'cea', 'collector'))
);
--> statement-breakpoint
CREATE TABLE "entity_bank_account" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"bank_id" text NOT NULL,
	"account_type" text NOT NULL,
	"account_number" text NOT NULL,
	"holder_name" text NOT NULL,
	"holder_legal_id_type" text NOT NULL,
	"holder_legal_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_bank_account_entity_id_bank_id_account_number_key" UNIQUE("entity_id","bank_id","account_number"),
	CONSTRAINT "entity_bank_account_account_type_check" CHECK ("entity_bank_account"."account_type" in ('AHORROS', 'CORRIENTE', 'DEPOSITO_ELECTRONICO')),
	CONSTRAINT "entity_bank_account_holder_legal_id_type_check" CHECK ("entity_bank_account"."holder_legal_id_type" in ('CC', 'NIT', 'PP', 'CE', 'TI', 'DNI'))
);
--> statement-breakpoint
CREATE TABLE "staff_member" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_member_user_id_entity_id_key" UNIQUE("user_id","entity_id"),
	CONSTRAINT "staff_member_role_check" CHECK ("staff_member"."role" in ('admin', 'supervisor', 'cashier', 'scheduler', 'instructor'))
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"citizen_id" uuid NOT NULL,
	"obligation_id" uuid,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_channel_check" CHECK ("notification"."channel" in ('email', 'sms')),
	CONSTRAINT "notification_status_check" CHECK ("notification"."status" in ('queued', 'sent', 'failed')),
	CONSTRAINT "notification_sent_at_check" CHECK (("notification"."status" = 'sent') = ("notification"."sent_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "fine" (
	"obligation_id" uuid PRIMARY KEY NOT NULL,
	"kind" text GENERATED ALWAYS AS ('fine') STORED NOT NULL,
	"infraction_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"location" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"agent_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infraction" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"amount_in_cents" bigint NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infraction_code_key" UNIQUE("code"),
	CONSTRAINT "infraction_amount_in_cents_check" CHECK ("infraction"."amount_in_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "obligation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"citizen_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"number" text NOT NULL,
	"amount_in_cents" bigint NOT NULL,
	"discount_in_cents" bigint DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligation_entity_id_number_key" UNIQUE("entity_id","number"),
	CONSTRAINT "obligation_id_kind_key" UNIQUE("id","kind"),
	CONSTRAINT "obligation_kind_check" CHECK ("obligation"."kind" in ('fine', 'procedure')),
	CONSTRAINT "obligation_status_check" CHECK ("obligation"."status" in ('pending', 'in_agreement', 'paid', 'void')),
	CONSTRAINT "obligation_amount_in_cents_check" CHECK ("obligation"."amount_in_cents" > 0),
	CONSTRAINT "obligation_discount_in_cents_check" CHECK ("obligation"."discount_in_cents" >= 0 and "obligation"."discount_in_cents" <= "obligation"."amount_in_cents")
);
--> statement-breakpoint
CREATE TABLE "procedure" (
	"obligation_id" uuid PRIMARY KEY NOT NULL,
	"kind" text GENERATED ALWAYS AS ('procedure') STORED NOT NULL,
	"procedure_type_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"amount_in_cents" bigint NOT NULL,
	"requires_appointment" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedure_type_code_key" UNIQUE("code"),
	CONSTRAINT "procedure_type_amount_in_cents_check" CHECK ("procedure_type"."amount_in_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "installment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"payment_agreement_id" uuid NOT NULL,
	"number" smallint NOT NULL,
	"due_on" date NOT NULL,
	"amount_in_cents" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "installment_payment_agreement_id_number_key" UNIQUE("payment_agreement_id","number"),
	CONSTRAINT "installment_status_check" CHECK ("installment"."status" in ('pending', 'paid', 'overdue')),
	CONSTRAINT "installment_number_check" CHECK ("installment"."number" > 0),
	CONSTRAINT "installment_amount_in_cents_check" CHECK ("installment"."amount_in_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"citizen_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"installment_id" uuid,
	"amount_in_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'COP' NOT NULL,
	"reference" text NOT NULL,
	"provider" text DEFAULT 'wompi' NOT NULL,
	"provider_transaction_id" text,
	"payment_method_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"receipt_number" text,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reference_key" UNIQUE("reference"),
	CONSTRAINT "payment_provider_transaction_id_key" UNIQUE("provider_transaction_id"),
	CONSTRAINT "payment_receipt_number_key" UNIQUE("receipt_number"),
	CONSTRAINT "payment_status_check" CHECK ("payment"."status" in ('pending', 'approved', 'declined', 'voided', 'error')),
	CONSTRAINT "payment_amount_in_cents_check" CHECK ("payment"."amount_in_cents" > 0),
	CONSTRAINT "payment_finalized_at_check" CHECK (("payment"."status" = 'pending') = ("payment"."finalized_at" is null))
);
--> statement-breakpoint
CREATE TABLE "payment_agreement" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"obligation_id" uuid NOT NULL,
	"installment_count" smallint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_agreement_status_check" CHECK ("payment_agreement"."status" in ('active', 'completed', 'defaulted', 'cancelled')),
	CONSTRAINT "payment_agreement_installment_count_check" CHECK ("payment_agreement"."installment_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_event" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider" text DEFAULT 'wompi' NOT NULL,
	"event_type" text NOT NULL,
	"checksum" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_event_checksum_key" UNIQUE("checksum")
);
--> statement-breakpoint
CREATE TABLE "payout" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"entity_bank_account_id" uuid NOT NULL,
	"amount_in_cents" bigint NOT NULL,
	"currency" char(3) DEFAULT 'COP' NOT NULL,
	"reference" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"provider_payout_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_reference_key" UNIQUE("reference"),
	CONSTRAINT "payout_idempotency_key_key" UNIQUE("idempotency_key"),
	CONSTRAINT "payout_provider_payout_id_key" UNIQUE("provider_payout_id"),
	CONSTRAINT "payout_status_check" CHECK ("payout"."status" in ('pending', 'processing', 'paid', 'failed')),
	CONSTRAINT "payout_amount_in_cents_check" CHECK ("payout"."amount_in_cents" > 0),
	CONSTRAINT "payout_finalized_at_check" CHECK (("payout"."status" in ('paid', 'failed')) = ("payout"."finalized_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "appointment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"citizen_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"procedure_type_id" uuid NOT NULL,
	"obligation_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "appointment_status_check" CHECK ("appointment"."status" in ('scheduled', 'attended', 'cancelled', 'no_show'))
);
--> statement-breakpoint
CREATE TABLE "course_enrollment" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"course_session_id" uuid NOT NULL,
	"citizen_id" uuid NOT NULL,
	"obligation_id" uuid NOT NULL,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"attended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_enrollment_course_session_id_citizen_id_key" UNIQUE("course_session_id","citizen_id"),
	CONSTRAINT "course_enrollment_status_check" CHECK ("course_enrollment"."status" in ('enrolled', 'attended', 'absent', 'cancelled')),
	CONSTRAINT "course_enrollment_attended_at_check" CHECK (("course_enrollment"."status" = 'attended') = ("course_enrollment"."attended_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "course_session" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"entity_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"discount_percent" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_session_ends_at_check" CHECK ("course_session"."ends_at" > "course_session"."starts_at"),
	CONSTRAINT "course_session_capacity_check" CHECK ("course_session"."capacity" > 0),
	CONSTRAINT "course_session_discount_percent_check" CHECK ("course_session"."discount_percent" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citizen" ADD CONSTRAINT "citizen_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_license" ADD CONSTRAINT "driver_license_citizen_id_citizen_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizen"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_owner_id_citizen_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."citizen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_document" ADD CONSTRAINT "vehicle_document_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_document" ADD CONSTRAINT "vehicle_document_issuer_entity_id_entity_id_fk" FOREIGN KEY ("issuer_entity_id") REFERENCES "public"."entity"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch" ADD CONSTRAINT "branch_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_bank_account" ADD CONSTRAINT "entity_bank_account_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_member" ADD CONSTRAINT "staff_member_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_citizen_id_citizen_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine" ADD CONSTRAINT "fine_infraction_id_infraction_id_fk" FOREIGN KEY ("infraction_id") REFERENCES "public"."infraction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine" ADD CONSTRAINT "fine_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fine" ADD CONSTRAINT "fine_obligation_id_kind_fkey" FOREIGN KEY ("obligation_id","kind") REFERENCES "public"."obligation"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation" ADD CONSTRAINT "obligation_citizen_id_citizen_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation" ADD CONSTRAINT "obligation_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_procedure_type_id_procedure_type_id_fk" FOREIGN KEY ("procedure_type_id") REFERENCES "public"."procedure_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure" ADD CONSTRAINT "procedure_obligation_id_kind_fkey" FOREIGN KEY ("obligation_id","kind") REFERENCES "public"."obligation"("id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procedure_type" ADD CONSTRAINT "procedure_type_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_payment_agreement_id_payment_agreement_id_fk" FOREIGN KEY ("payment_agreement_id") REFERENCES "public"."payment_agreement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_citizen_id_citizen_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_installment_id_installment_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_agreement" ADD CONSTRAINT "payment_agreement_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout" ADD CONSTRAINT "payout_entity_bank_account_id_entity_bank_account_id_fk" FOREIGN KEY ("entity_bank_account_id") REFERENCES "public"."entity_bank_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_citizen_id_citizen_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_procedure_type_id_procedure_type_id_fk" FOREIGN KEY ("procedure_type_id") REFERENCES "public"."procedure_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollment" ADD CONSTRAINT "course_enrollment_course_session_id_course_session_id_fk" FOREIGN KEY ("course_session_id") REFERENCES "public"."course_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollment" ADD CONSTRAINT "course_enrollment_citizen_id_citizen_id_fk" FOREIGN KEY ("citizen_id") REFERENCES "public"."citizen"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_enrollment" ADD CONSTRAINT "course_enrollment_obligation_id_obligation_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."obligation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_session" ADD CONSTRAINT "course_session_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_session" ADD CONSTRAINT "course_session_branch_id_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log" USING brin ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_log_table_name_record_id_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_impersonated_by_idx" ON "auth"."session" USING btree ("impersonated_by");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "auth"."verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "vehicle_owner_id_idx" ON "vehicle" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "vehicle_document_vehicle_id_kind_valid_until_idx" ON "vehicle_document" USING btree ("vehicle_id","kind","valid_until");--> statement-breakpoint
CREATE INDEX "vehicle_document_issuer_entity_id_idx" ON "vehicle_document" USING btree ("issuer_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_bank_account_entity_id_default_key" ON "entity_bank_account" USING btree ("entity_id") WHERE "entity_bank_account"."is_default";--> statement-breakpoint
CREATE INDEX "staff_member_entity_id_idx" ON "staff_member" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "notification_citizen_id_id_idx" ON "notification" USING btree ("citizen_id","id");--> statement-breakpoint
CREATE INDEX "notification_obligation_id_idx" ON "notification" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "fine_infraction_id_idx" ON "fine" USING btree ("infraction_id");--> statement-breakpoint
CREATE INDEX "fine_vehicle_id_idx" ON "fine" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "obligation_citizen_id_id_idx" ON "obligation" USING btree ("citizen_id","id");--> statement-breakpoint
CREATE INDEX "obligation_entity_id_status_id_idx" ON "obligation" USING btree ("entity_id","status","id");--> statement-breakpoint
CREATE INDEX "procedure_procedure_type_id_idx" ON "procedure" USING btree ("procedure_type_id");--> statement-breakpoint
CREATE INDEX "procedure_vehicle_id_idx" ON "procedure" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "procedure_type_entity_id_idx" ON "procedure_type" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "payment_citizen_id_id_idx" ON "payment" USING btree ("citizen_id","id");--> statement-breakpoint
CREATE INDEX "payment_obligation_id_idx" ON "payment" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "payment_installment_id_idx" ON "payment" USING btree ("installment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_agreement_obligation_id_key" ON "payment_agreement" USING btree ("obligation_id") WHERE "payment_agreement"."status" = 'active';--> statement-breakpoint
CREATE INDEX "payment_agreement_obligation_id_idx" ON "payment_agreement" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "payout_entity_id_id_idx" ON "payout" USING btree ("entity_id","id");--> statement-breakpoint
CREATE INDEX "payout_entity_bank_account_id_idx" ON "payout" USING btree ("entity_bank_account_id");--> statement-breakpoint
CREATE INDEX "appointment_branch_id_scheduled_at_idx" ON "appointment" USING btree ("branch_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "appointment_citizen_id_id_idx" ON "appointment" USING btree ("citizen_id","id");--> statement-breakpoint
CREATE INDEX "appointment_procedure_type_id_idx" ON "appointment" USING btree ("procedure_type_id");--> statement-breakpoint
CREATE INDEX "appointment_obligation_id_idx" ON "appointment" USING btree ("obligation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_enrollment_obligation_id_key" ON "course_enrollment" USING btree ("obligation_id") WHERE "course_enrollment"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "course_enrollment_obligation_id_idx" ON "course_enrollment" USING btree ("obligation_id");--> statement-breakpoint
CREATE INDEX "course_enrollment_citizen_id_idx" ON "course_enrollment" USING btree ("citizen_id");--> statement-breakpoint
CREATE INDEX "course_session_entity_id_idx" ON "course_session" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "course_session_branch_id_starts_at_idx" ON "course_session" USING btree ("branch_id","starts_at");