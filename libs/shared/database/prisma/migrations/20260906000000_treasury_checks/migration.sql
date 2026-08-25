-- CreateEnum
CREATE TYPE "CheckKind" AS ENUM ('THIRD_PARTY', 'OWN');

-- CreateEnum
CREATE TYPE "CheckFormat" AS ENUM ('PHYSICAL', 'ECHEQ');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('PORTFOLIO', 'DEPOSITED', 'ENDORSED', 'CLEARED', 'REJECTED', 'ISSUED', 'VOIDED');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "checkId" TEXT;

-- CreateTable
CREATE TABLE "checks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "CheckKind" NOT NULL,
    "format" "CheckFormat" NOT NULL DEFAULT 'PHYSICAL',
    "number" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "drawerCuit" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "receiptId" TEXT,
    "supplierPaymentId" TEXT,
    "financialAccountId" TEXT,
    "rejectionReason" TEXT,
    "rejectionFeeAmount" DECIMAL(14,2),
    "rejectedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checks_tenantId_idx" ON "checks"("tenantId");

-- CreateIndex
CREATE INDEX "checks_tenantId_status_idx" ON "checks"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "checks_tenantId_id_key" ON "checks"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "checks_tenantId_receiptId_key" ON "checks"("tenantId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "checks_tenantId_supplierPaymentId_key" ON "checks"("tenantId", "supplierPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_checkId_key" ON "journal_entries"("checkId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_checkId_key" ON "journal_entries"("tenantId", "checkId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_checkId_fkey" FOREIGN KEY ("tenantId", "checkId") REFERENCES "checks"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_tenantId_receiptId_fkey" FOREIGN KEY ("tenantId", "receiptId") REFERENCES "receipts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_tenantId_supplierPaymentId_fkey" FOREIGN KEY ("tenantId", "supplierPaymentId") REFERENCES "supplier_payments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT for the 1 new tenant-scoped table, in THIS migration (not a
-- follow-up fix) - same setting/role as every other tenant-scoped table,
-- see 20260813000000_accounts_payable_purchase_invoice /
-- 20260828000000_purchase_credit_note. journal_entries already has RLS
-- from its original migration - only checkId (a column, not a table) was
-- added to it above, nothing new to enable there.

ALTER TABLE "checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "checks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "checks"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "checks" TO plexo_app;
