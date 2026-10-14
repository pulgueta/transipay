-- The audit log is append-only: also reject TRUNCATE (a statement-level operation).
-- public.audit_log_reject_change() raises an exception for each operation, so it serves this trigger too.
CREATE TRIGGER audit_log_no_truncate
BEFORE TRUNCATE ON public.audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_reject_change();
--> statement-breakpoint
-- Audit user changes (role, ban). The table_name value is 'user'.
CREATE TRIGGER user_audit
AFTER INSERT OR UPDATE OR DELETE ON auth."user"
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
