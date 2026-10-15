-- Staff close appointments and record course attendance. An attendance gives a fine discount.
-- Thus these tables get the same audit trigger as the other sensitive tables (see 0001 and 0005).
CREATE TRIGGER appointment_audit
AFTER INSERT OR UPDATE OR DELETE ON public.appointment
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER course_session_audit
AFTER INSERT OR UPDATE OR DELETE ON public.course_session
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
--> statement-breakpoint
CREATE TRIGGER course_enrollment_audit
AFTER INSERT OR UPDATE OR DELETE ON public.course_enrollment
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
