-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'ERROR');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "provider" "ConnectorProvider" NOT NULL DEFAULT 'MERCADO_PAGO',
    "externalId" TEXT,
    "initPoint" TEXT,
    "qrCodeBase64" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "externalPaymentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentRaw" JSONB,
    "idempotencyKey" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_idempotencyKey_key" ON "payment_intents"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_intents_tenantId_status_idx" ON "payment_intents"("tenantId", "status");

-- CreateIndex
CREATE INDEX "payment_intents_tenantId_documentType_documentId_idx" ON "payment_intents"("tenantId", "documentType", "documentId");

-- CreateIndex
CREATE INDEX "payment_intents_externalPaymentId_idx" ON "payment_intents"("externalPaymentId");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_tenantId_connectorId_fkey" FOREIGN KEY ("tenantId", "connectorId") REFERENCES "connectors"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT, mismo patrón que 20260909000000_connectors.

ALTER TABLE "payment_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_intents" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "payment_intents"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_intents" TO plexo_app;
