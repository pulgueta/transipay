-- A payout command does not change after the payout leaves 'draft' (docs/architecture/remediation.md, "Payouts").
-- The command is all columns except the list in public.payout_command (0009).
-- Rules:
--   1. A payout that left draft cannot go back to draft, and a paid payout cannot change its status.
--   2. The command and command_hash cannot change after the payout left draft.
--   3. first_dispatch_at and provider_payout_id are written one time.
--   4. The first claim (status 'submitting') sets first_dispatch_at. retry_deadline is always first_dispatch_at plus 23 hours,
--      because Wompi keeps an idempotency key for 24 hours. A claim after the retry deadline is not permitted.
--   5. The command hash is written when the payout leaves draft.
CREATE FUNCTION public.payout_keep_command() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'payout %: a payout that left draft cannot go back to draft', OLD.id;
    END IF;
    IF OLD.status = 'paid' AND NEW.status <> 'paid' THEN
      RAISE EXCEPTION 'payout %: a paid payout cannot change its status', OLD.id;
    END IF;
    IF public.payout_command(NEW) IS DISTINCT FROM public.payout_command(OLD)
      OR NEW.command_hash IS DISTINCT FROM OLD.command_hash THEN
      RAISE EXCEPTION 'payout %: the command cannot change after the payout left draft', OLD.id;
    END IF;
    IF OLD.first_dispatch_at IS NOT NULL AND NEW.first_dispatch_at IS DISTINCT FROM OLD.first_dispatch_at THEN
      RAISE EXCEPTION 'payout %: the first dispatch time cannot change', OLD.id;
    END IF;
    IF OLD.provider_payout_id IS NOT NULL AND NEW.provider_payout_id IS DISTINCT FROM OLD.provider_payout_id THEN
      RAISE EXCEPTION 'payout %: the Wompi payout id cannot change', OLD.id;
    END IF;
  END IF;

  IF NEW.status = 'submitting' AND NEW.first_dispatch_at IS NULL THEN
    NEW.first_dispatch_at := now();
  END IF;
  NEW.retry_deadline := NEW.first_dispatch_at + interval '23 hours';
  IF NEW.status = 'submitting'
    AND (TG_OP = 'INSERT' OR OLD.status <> 'submitting')
    AND NEW.retry_deadline <= now() THEN
    RAISE EXCEPTION 'payout %: the retry deadline is in the past, so a new send is not safe', NEW.id;
  END IF;

  IF NEW.status <> 'draft' AND (TG_OP = 'INSERT' OR OLD.status = 'draft') THEN
    NEW.command_hash := public.payout_command_hash(NEW);
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payout_keep_command
BEFORE INSERT OR UPDATE ON public.payout
FOR EACH ROW EXECUTE FUNCTION public.payout_keep_command();
