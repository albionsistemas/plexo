-- Lets system/cron code (running as plexo_app, which is NOSUPERUSER
-- NOBYPASSRLS by design - see 20260723000001_row_level_security)
-- enumerate every tenant id without already being handed one, which is
-- what every existing entrypoint does today (login receives it from the
-- form, everything else runs inside a request that already resolved it).
-- A scheduled job that has to sweep "every tenant" has no such starting
-- point.
--
-- SECURITY DEFINER makes this run with the privileges of whoever creates
-- it (the migration/admin role - effectively superuser, same trust level
-- already relied on by audit_log_capture() in the audit-log-immutability
-- migration), which is what lets it see all rows despite FORCE ROW LEVEL
-- SECURITY on "tenants". The only capability being handed to plexo_app is
-- "list tenant ids" - nothing broader, and nothing that touches any other
-- table.
CREATE FUNCTION list_tenant_ids() RETURNS SETOF text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM tenants ORDER BY "createdAt" ASC;
$$;

GRANT EXECUTE ON FUNCTION list_tenant_ids() TO plexo_app;
