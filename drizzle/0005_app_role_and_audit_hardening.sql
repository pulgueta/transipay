-- Application role. The application connects as a login role that is a member of transipay_app.
-- transipay_app does not own the tables. Migrations run as the table owner.
-- Roles are cluster-wide, so the role can exist already (for example, from another database on the same server).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'transipay_app') THEN
    CREATE ROLE transipay_app NOLOGIN;
  END IF;
EXCEPTION
  -- A parallel migration on the same server made the role first.
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public, auth TO transipay_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public, auth TO transipay_app;
--> statement-breakpoint
-- Tables that later migrations make get the same privileges.
-- Default privileges apply to tables that the role that runs this statement makes, so run all migrations as the same owner.
ALTER DEFAULT PRIVILEGES IN SCHEMA public, auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO transipay_app;
--> statement-breakpoint
-- The application can only read the audit log. Only the audit trigger writes it.
REVOKE ALL ON public.audit_log FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON public.audit_log FROM transipay_app;
--> statement-breakpoint
GRANT SELECT ON public.audit_log TO transipay_app;
--> statement-breakpoint
-- The audit trigger runs as the function owner (the migration owner), not as the caller.
-- So transipay_app does not need INSERT on audit_log, and it cannot write false audit rows.
-- The search_path is fixed and pg_temp is last, so a caller cannot replace a table or function. All table names are qualified.
CREATE OR REPLACE FUNCTION public.audit_row_change() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
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
-- Only triggers call this function.
REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC;
--> statement-breakpoint
-- A change to the role or the ban of a user, and a delete of a user, need an actor (app.actor_id, see withActor).
-- Allowed changes without an actor:
--   1. better-auth 1.7.7 admin plugin, hook session.create.before (dist/plugins/admin/admin.mjs):
--      when a banned user signs in after the ban expired, better-auth sets banned = false,
--      ban_reason = null, and ban_expires = null. It does not set an actor.
--      The trigger accepts only this exact change, and only when the old ban_expires is in the past.
-- Other better-auth writes to these columns are admin endpoints (set-role, ban-user, unban-user,
-- admin-update-user, remove-user). They must run in withActor. Self-delete (/delete-user) is not enabled.
CREATE OR REPLACE FUNCTION public.user_require_actor() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF nullif(current_setting('app.actor_id', true), '') IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'A delete of a user needs an actor (app.actor_id)';
  END IF;

  IF NEW.role IS NOT DISTINCT FROM OLD.role
    AND NEW.banned IS NOT DISTINCT FROM OLD.banned
    AND NEW.ban_reason IS NOT DISTINCT FROM OLD.ban_reason
    AND NEW.ban_expires IS NOT DISTINCT FROM OLD.ban_expires THEN
    RETURN NEW;
  END IF;

  -- Allowed change 1: better-auth removes a ban that expired.
  IF OLD.banned
    AND NOT NEW.banned
    AND OLD.ban_expires IS NOT NULL
    AND OLD.ban_expires <= now()
    AND NEW.ban_reason IS NULL
    AND NEW.ban_expires IS NULL
    AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'A change to the role or ban of a user needs an actor (app.actor_id)';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_require_actor
BEFORE UPDATE OR DELETE ON auth."user"
FOR EACH ROW EXECUTE FUNCTION public.user_require_actor();
--> statement-breakpoint
-- A notification is legal evidence. Its content, recipient, channel, and obligation are a snapshot.
-- Only the delivery columns (status, sent_at) and updated_at can change. A new column is part of the snapshot
-- until you add it to this list. A delete is not permitted.
CREATE OR REPLACE FUNCTION public.notification_keep_evidence() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  delivery_columns text[] := ARRAY['status', 'sent_at', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'notification is evidence: DELETE is not permitted';
  END IF;

  IF (to_jsonb(NEW) - delivery_columns) IS DISTINCT FROM (to_jsonb(OLD) - delivery_columns) THEN
    RAISE EXCEPTION 'notification is evidence: only status and sent_at can change';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER notification_keep_evidence
BEFORE UPDATE OR DELETE ON public.notification
FOR EACH ROW EXECUTE FUNCTION public.notification_keep_evidence();
--> statement-breakpoint
CREATE TRIGGER notification_audit
AFTER INSERT OR UPDATE OR DELETE ON public.notification
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();
