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
    'categories',
    'articles',
    'article_variants',
    'price_history',
    'warehouses',
    'stock_ledger',
    'minimum_stock',
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

-- audit_log gets RLS for tenant isolation on read/insert, same as everything
-- else, but deliberately NO update/delete policy and NO update/delete grant:
-- see the audit-log-immutability migration for the trigger that also blocks
-- it at the row level regardless of who's connected.
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_insert_select ON "audit_log"
  FOR SELECT USING ("tenantId" = current_setting('app.tenant_id', true));
CREATE POLICY tenant_isolation_insert ON "audit_log"
  FOR INSERT WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plexo_app;
REVOKE UPDATE, DELETE ON "audit_log" FROM plexo_app;
