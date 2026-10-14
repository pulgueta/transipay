-- Audit trail for sensitive tables.
-- The application sets the actor with: select set_config('app.actor_id', '<user uuid>', true)
-- (see src/server/db/with-actor.ts). Without it, actor_user_id is null.
CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  old_row jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  row_data jsonb := coalesce(new_row, old_row);
BEGIN
  -- Do not log an update that changes no value.
  IF TG_OP = 'UPDATE' AND old_row = new_row THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_log (actor_user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    nullif(current_setting('app.actor_id', true), '')::uuid,
    lower(TG_OP),
    TG_TABLE_NAME,
    -- Subtype tables (fine, procedure) use obligation_id as their key.
    coalesce(row_data ->> 'id', row_data ->> 'obligation_id')::uuid,
    old_row,
    new_row
  );

  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- The audit log is append-only.
CREATE OR REPLACE FUNCTION public.audit_log_reject_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.audit_log_reject_change();
--> statement-breakpoint
CREATE TRIGGER obligation_audit
AFTER INSERT OR UPDATE OR DELETE ON public.obligation
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER fine_audit
AFTER INSERT OR UPDATE OR DELETE ON public.fine
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER procedure_audit
AFTER INSERT OR UPDATE OR DELETE ON public.procedure
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER payment_audit
AFTER INSERT OR UPDATE OR DELETE ON public.payment
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER payment_agreement_audit
AFTER INSERT OR UPDATE OR DELETE ON public.payment_agreement
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER installment_audit
AFTER INSERT OR UPDATE OR DELETE ON public.installment
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER payout_audit
AFTER INSERT OR UPDATE OR DELETE ON public.payout
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER staff_member_audit
AFTER INSERT OR UPDATE OR DELETE ON public.staff_member
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER entity_bank_account_audit
AFTER INSERT OR UPDATE OR DELETE ON public.entity_bank_account
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
