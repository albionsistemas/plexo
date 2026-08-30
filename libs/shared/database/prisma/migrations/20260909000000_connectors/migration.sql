-- CreateEnum
CREATE TYPE "ConnectorProvider" AS ENUM ('MERCADO_PAGO', 'TIENDANUBE', 'MERCADO_LIBRE');

-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "connectors" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" "ConnectorProvider" NOT NULL,
    "status" "ConnectorStatus" NOT NULL DEFAULT 'PENDING',
    "externalAccountId" TEXT,
    "externalNickname" TEXT,
    "scopes" TEXT,
    "connectedByUserId" TEXT,
    "connectedAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connector_secrets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connector_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "connectors_tenantId_provider_key" ON "connectors"("tenantId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "connectors_tenantId_id_key" ON "connectors"("tenantId", "id");

-- CreateIndex
CREATE INDEX "connectors_tenantId_provider_status_idx" ON "connectors"("tenantId", "provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "connector_secrets_connectorId_key_key" ON "connector_secrets"("connectorId", "key");

-- CreateIndex
CREATE INDEX "connector_secrets_tenantId_idx" ON "connector_secrets"("tenantId");

-- AddForeignKey
ALTER TABLE "connector_secrets" ADD CONSTRAINT "connector_secrets_tenantId_connectorId_fkey" FOREIGN KEY ("tenantId", "connectorId") REFERENCES "connectors"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS + GRANT for the 2 new tenant-scoped tables, in THIS migration (not a
-- follow-up fix) - same setting/role as every other tenant-scoped table,
-- see 20260906000000_treasury_checks.

ALTER TABLE "connectors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connectors" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "connectors"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "connectors" TO plexo_app;

ALTER TABLE "connector_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "connector_secrets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "connector_secrets"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "connector_secrets" TO plexo_app;
