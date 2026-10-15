-- A course discount is from 1% to 99%, because a fine is settled only by a payment (see staff-sessions.ts).
-- If a stored session has a discount of 0 or 100, the new CHECK stops the migration. Staff must correct the session first.
ALTER TABLE "course_session" DROP CONSTRAINT "course_session_discount_percent_check";--> statement-breakpoint
ALTER TABLE "course_session" ADD CONSTRAINT "course_session_discount_percent_check" CHECK ("course_session"."discount_percent" between 1 and 99);--> statement-breakpoint
-- A document link gives a user access to the obligations and payments of a citizen.
-- Thus the citizen table gets the same audit trigger as the other sensitive tables (see 0001, 0005, and 0018).
CREATE TRIGGER citizen_audit
AFTER INSERT OR UPDATE OR DELETE ON public.citizen
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
