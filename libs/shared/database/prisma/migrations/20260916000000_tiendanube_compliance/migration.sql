-- Fase 6 de PLAN_TIENDANUBE.md (hardening) - los 3 webhooks obligatorios de
-- protección de datos (store/redact, customers/redact, customers/data_request)
-- pueden llegar DESPUÉS de que el Connector ya no esté CONNECTED (store/redact
-- explícitamente se dispara "after a merchant uninstall your app", según la
-- doc oficial - momento en el que app/uninstalled ya dejó el Connector en
-- REVOKED). find_tenant_by_connector() (20260912000000_tiendanube_orders)
-- sólo mira CONNECTED a propósito para el camino de órdenes - acá hace falta
-- resolver el tenant igual, sin ese filtro, para poder cumplir el pedido de
-- borrado/redacción contra el Connector correcto.
CREATE FUNCTION find_tenant_by_connector_any_status(p_provider text, p_external_account_id text)
RETURNS TABLE(tenant_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId" FROM connectors
  WHERE provider = p_provider::"ConnectorProvider"
    AND "externalAccountId" = p_external_account_id;
$$;

GRANT EXECUTE ON FUNCTION find_tenant_by_connector_any_status(text, text) TO plexo_app;
