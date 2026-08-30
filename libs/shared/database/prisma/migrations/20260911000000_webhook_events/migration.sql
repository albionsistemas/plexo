-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "ConnectorProvider" NOT NULL,
    "tenantId" TEXT,
    "externalId" TEXT NOT NULL,
    "requestId" TEXT,
    "type" TEXT NOT NULL,
    "signatureOk" BOOLEAN NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_externalId_type_key" ON "webhook_events"("provider", "externalId", "type");

-- CreateIndex
CREATE INDEX "webhook_events_tenantId_processed_idx" ON "webhook_events"("tenantId", "processed");

-- Global como system_error_log/database_backups (ver 20260825000000_admin_backoffice) -
-- sin RLS, sólo GRANT: esta tabla existe precisamente para deduplicar antes
-- de saber (o confiar en) qué tenant es, así que no puede estar RLS-scoped.
GRANT SELECT, INSERT, UPDATE ON "webhook_events" TO plexo_app;
