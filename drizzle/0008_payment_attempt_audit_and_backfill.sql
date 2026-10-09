-- An attempt holds money state, so the audit trigger records each change, as on payment.
CREATE TRIGGER payment_attempt_audit
AFTER INSERT OR UPDATE OR DELETE ON public.payment_attempt
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
-- Before this change, a final payment kept its one transaction on the payment row.
-- Copy each of these transactions to an attempt, so that a new event for it is a repeat and not a second approval.
INSERT INTO public.payment_attempt
  (payment_id, provider_transaction_id, status, amount_in_cents, currency, payment_method_type, finalized_at, created_at)
SELECT id, provider_transaction_id, status, amount_in_cents, currency, payment_method_type, finalized_at, coalesce(finalized_at, created_at)
FROM public.payment
WHERE provider_transaction_id IS NOT NULL AND status <> 'pending';
