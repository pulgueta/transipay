-- next_reconcile_at is a schedule. It is not part of the payout command (see public.payout_command in 0009).
CREATE OR REPLACE FUNCTION public.payout_command(p public.payout) RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT to_jsonb(p) - ARRAY[
    'status', 'provider_payout_id', 'review_reason', 'finalized_at', 'first_dispatch_at',
    'retry_deadline', 'lease_token', 'lease_expires_at', 'command_hash', 'created_at', 'updated_at',
    'next_reconcile_at'
  ]
$$;
--> statement-breakpoint
-- Schedules the reconciliation when the status of a payout changes (docs/architecture/remediation.md, "Payouts"):
--   uncertain: now. The send result is not known, so reconciliation asks Wompi at once.
--   submitted: one hour later. Wompi accepted the payout. Reconciliation asks only when no webhook came.
--   other statuses: null. Reconciliation does not read them.
-- When the status does not change, the value stays. Reconciliation moves it after each lookup.
CREATE FUNCTION public.payout_schedule_reconcile() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.next_reconcile_at := CASE NEW.status
      WHEN 'uncertain' THEN now()
      WHEN 'submitted' THEN now() + interval '1 hour'
    END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payout_schedule_reconcile
BEFORE INSERT OR UPDATE ON public.payout
FOR EACH ROW EXECUTE FUNCTION public.payout_schedule_reconcile();
--> statement-breakpoint
-- The open payouts from before this migration are due now.
UPDATE public.payout SET next_reconcile_at = now() WHERE status IN ('uncertain', 'submitted');
