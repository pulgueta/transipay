-- An impersonation session is valid only while its admin can impersonate.
-- When an admin is banned or loses the admin role, delete the impersonation sessions of that admin.
-- This applies to every write path, also the better-auth endpoints that do not use our middleware.
-- A delete of the admin uses the ON DELETE CASCADE of session.impersonated_by (migration 0004).
CREATE OR REPLACE FUNCTION public.user_revoke_impersonation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF (NEW.banned AND NOT OLD.banned)
    OR ('admin' = ANY (string_to_array(OLD.role, ','))
      AND NOT 'admin' = ANY (string_to_array(NEW.role, ','))) THEN
    DELETE FROM auth.session WHERE impersonated_by = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER user_revoke_impersonation
AFTER UPDATE OF banned, role ON auth."user"
FOR EACH ROW EXECUTE FUNCTION public.user_revoke_impersonation();
