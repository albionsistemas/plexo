-- CreateEnum
CREATE TYPE "WithholdingTaxType" AS ENUM ('INCOME_TAX', 'VAT', 'GROSS_INCOME');

-- CreateEnum
CREATE TYPE "ArgentineJurisdiction" AS ENUM ('CABA', 'BUENOS_AIRES', 'CATAMARCA', 'CHACO', 'CHUBUT', 'CORDOBA', 'CORRIENTES', 'ENTRE_RIOS', 'FORMOSA', 'JUJUY', 'LA_PAMPA', 'LA_RIOJA', 'MENDOZA', 'MISIONES', 'NEUQUEN', 'RIO_NEGRO', 'SALTA', 'SAN_JUAN', 'SAN_LUIS', 'SANTA_CRUZ', 'SANTA_FE', 'SANTIAGO_DEL_ESTERO', 'TIERRA_DEL_FUEGO', 'TUCUMAN');

-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "rfqGroupId" TEXT;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "withholdingAgentGrossIncome" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withholdingAgentIncomeTax" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withholdingAgentVat" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "withholding_regimes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxType" "WithholdingTaxType" NOT NULL,
    "jurisdiction" "ArgentineJurisdiction",
    "rate" DECIMAL(5,2) NOT NULL,
    "minTaxableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "managedByAccountant" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "withholding_regimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_withholdings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierPaymentId" TEXT NOT NULL,
    "regimeId" TEXT,
    "taxType" "WithholdingTaxType" NOT NULL,
    "jurisdiction" "ArgentineJurisdiction",
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "certificateNumber" TEXT,

    CONSTRAINT "supplier_payment_withholdings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withholding_regimes_tenantId_taxType_idx" ON "withholding_regimes"("tenantId", "taxType");

-- CreateIndex
CREATE UNIQUE INDEX "withholding_regimes_tenantId_code_validFrom_key" ON "withholding_regimes"("tenantId", "code", "validFrom");

-- CreateIndex
CREATE INDEX "supplier_payment_withholdings_tenantId_supplierPaymentId_idx" ON "supplier_payment_withholdings"("tenantId", "supplierPaymentId");

-- CreateIndex
CREATE INDEX "quote_requests_tenantId_rfqGroupId_idx" ON "quote_requests"("tenantId", "rfqGroupId");

-- AddForeignKey
ALTER TABLE "supplier_payment_withholdings" ADD CONSTRAINT "supplier_payment_withholdings_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_withholdings" ADD CONSTRAINT "supplier_payment_withholdings_regimeId_fkey" FOREIGN KEY ("regimeId") REFERENCES "withholding_regimes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Same tenant-isolation RLS every tenant-scoped table gets (see e.g.
-- 20260808000002_purchases_module_rls) - new tables default to no RLS at
-- all, so this has to be explicit every time a CreateTable happens.
ALTER TABLE "withholding_regimes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "withholding_regimes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "withholding_regimes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "withholding_regimes" TO plexo_app;

ALTER TABLE "supplier_payment_withholdings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payment_withholdings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_payment_withholdings"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "supplier_payment_withholdings" TO plexo_app;

-- withholding_regimes is versioned the same way tax_definitions is (see the
-- schema comment on the model) - a rate/jurisdiction change never edits an
-- existing row, it closes validTo and inserts a new one, so a
-- SupplierPaymentWithholding already recorded keeps its own frozen
-- taxType/jurisdiction/concept/amount regardless of what happens to the
-- regime afterward. Same DB-level guarantee as tax_definition_version_lock,
-- for the same reason: an accountant's "what rate was in effect on date X"
-- has to stay answerable from history, not just from app-level discipline.
CREATE OR REPLACE FUNCTION withholding_regime_version_lock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."taxType" IS DISTINCT FROM OLD."taxType"
    OR NEW."jurisdiction" IS DISTINCT FROM OLD."jurisdiction"
    OR NEW."rate" IS DISTINCT FROM OLD."rate"
    OR NEW."minTaxableAmount" IS DISTINCT FROM OLD."minTaxableAmount"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
  THEN
    RAISE EXCEPTION 'withholding_regimes are versioned, not edited in place - only validTo/name/managedByAccountant may change on an existing row; reviseRegime() creates a new row for a rate/jurisdiction change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER withholding_regime_version_lock
  BEFORE UPDATE ON "withholding_regimes"
  FOR EACH ROW EXECUTE FUNCTION withholding_regime_version_lock();
