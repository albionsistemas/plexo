-- The add_purchases_module migration created these 7 tables but forgot the
-- RLS policy + plexo_app GRANTs every other tenant-scoped table gets (see
-- e.g. 20260801000000_tenant_settings_and_recurring_reminders) - caught
-- when curl against the real API returned "permiso denegado a la tabla
-- transport_modes" (42501), since plexo_app had no privileges on them at
-- all yet.

ALTER TABLE "transport_modes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "transport_modes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "transport_modes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "transport_modes" TO plexo_app;

ALTER TABLE "payment_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_terms" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_terms"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_terms" TO plexo_app;

ALTER TABLE "delivery_times" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_times" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "delivery_times"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "delivery_times" TO plexo_app;

ALTER TABLE "quote_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "quote_requests"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "quote_requests" TO plexo_app;

ALTER TABLE "quote_request_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_request_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "quote_request_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "quote_request_lines" TO plexo_app;

ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_orders"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_orders" TO plexo_app;

ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_order_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_order_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_order_lines" TO plexo_app;
