-- Row Level Security: multitenancy isolation.
-- Assumes a non-superuser, non-BYPASSRLS role (plexo_app) is used at runtime.
-- That role is created via docker/postgres-init/01-init-roles.sql for local/dev;
-- in managed cloud Postgres it must be provisioned equivalently before this runs.

ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_self_only ON "tenants"
  USING (id = current_setting('app.tenant_id', true))
  WITH CHECK (id = current_setting('app.tenant_id', true));

DO $$
DECLARE
  tenant_scoped_tables text[] := ARRAY[
    'users',
    'user_module_access',
    'customers',
    'products',
    'stock_movements',
    'invoices',
    'invoice_lines',
    'quotes',
    'quote_lines',
    'receipts',
    'accounting_accounts',
    'journal_entries',
    'journal_entry_lines',
    'tax_configs',
    'financial_accounts',
    'financial_transactions'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tenant_scoped_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))',
      t
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plexo_app;
