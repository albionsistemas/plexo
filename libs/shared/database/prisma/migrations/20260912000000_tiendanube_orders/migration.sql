-- CreateEnum
CREATE TYPE "TiendanubeOrderStatus" AS ENUM ('PENDING_REVIEW', 'CONVERTED', 'ERROR');

-- CreateTable
CREATE TABLE "tiendanube_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tiendanubeStoreId" TEXT NOT NULL,
    "tiendanubeOrderId" TEXT NOT NULL,
    "tiendanubeOrderNumber" INTEGER,
    "status" "TiendanubeOrderStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewReason" TEXT,
    "customerId" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactIdentification" TEXT,
    "currency" TEXT NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "lineItems" JSONB NOT NULL,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tiendanube_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tiendanube_orders_tenantId_status_idx" ON "tiendanube_orders"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tiendanube_orders_tenantId_tiendanubeOrderId_key" ON "tiendanube_orders"("tenantId", "tiendanubeOrderId");

-- AddForeignKey (FK simple, no compuesta - customerId es una referencia
-- "comercial", mismo criterio ya documentado en PROGRESS.md para
-- customerId/supplierId en otros documentos)
ALTER TABLE "tiendanube_orders" ADD CONSTRAINT "tiendanube_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT, mismo patrón que toda tabla tenant-scoped (ver
-- 20260909000000_connectors).
ALTER TABLE "tiendanube_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tiendanube_orders" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tiendanube_orders"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "tiendanube_orders" TO plexo_app;

-- Resuelve "a qué tenant pertenece este store_id de Tiendanube" ANTES de
-- que exista contexto de tenant - el webhook de Tiendanube (POST
-- /webhooks/tiendanube, @Public()) sólo recibe store_id en el payload, no
-- un tenantId propio (a diferencia de Mercado Pago, cuyo notification_url
-- lleva ?client=<tenantId> armado por nosotros mismos). Mismo mecanismo y
-- mismo nivel de confianza que find_tenant_by_oauth_account() (ver
-- 20260826000000_auth_onboarding) - login/OAuth también corren pre-tenant.
-- Sólo CONNECTED: un connector DESCONECTADO/REVOCADO no debe resolver a un
-- tenant que ya no quiere procesar estas notificaciones.
CREATE FUNCTION find_tenant_by_connector(p_provider text, p_external_account_id text)
RETURNS TABLE(tenant_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId" FROM connectors
  WHERE provider = p_provider::"ConnectorProvider"
    AND "externalAccountId" = p_external_account_id
    AND status = 'CONNECTED';
$$;

GRANT EXECUTE ON FUNCTION find_tenant_by_connector(text, text) TO plexo_app;
