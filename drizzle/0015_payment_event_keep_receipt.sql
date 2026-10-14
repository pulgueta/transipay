-- A payment_event row is the receipt of a webhook (docs/architecture/remediation.md, "Payments").
-- UNIQUE (integration, checksum) stops a second delivery of the same event only while the row stays.
-- If the row is deleted or its key changes, the same event can be recorded again and its money effects can occur again.
-- Rules:
--   1. A delete is not permitted.
--   2. Only processed_at can change. A new column cannot change until you add it to this function.
--   3. processed_at is written one time: from null to a value. It cannot change again, and it cannot go back to null.
CREATE FUNCTION public.payment_event_keep_receipt() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payment_event %: a webhook receipt cannot be deleted', OLD.id;
  END IF;

  IF (to_jsonb(NEW) - 'processed_at') IS DISTINCT FROM (to_jsonb(OLD) - 'processed_at') THEN
    RAISE EXCEPTION 'payment_event %: only processed_at can change', OLD.id;
  END IF;

  IF OLD.processed_at IS NOT NULL AND NEW.processed_at IS DISTINCT FROM OLD.processed_at THEN
    RAISE EXCEPTION 'payment_event %: processed_at cannot change after it is set', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER payment_event_keep_receipt
BEFORE UPDATE OR DELETE ON public.payment_event
FOR EACH ROW EXECUTE FUNCTION public.payment_event_keep_receipt();
