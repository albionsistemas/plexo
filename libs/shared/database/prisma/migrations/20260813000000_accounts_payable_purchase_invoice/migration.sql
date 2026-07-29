-- Cuentas a Pagar + Factura de Compra (esquema GRNI) - ver decisiones de
-- arquitectura en PROGRESS.md. RLS+GRANT incluidos en esta misma migración
-- (no en una de seguimiento) - ver 20260808000002_purchases_module_rls
-- para la vez que se olvidaron y hubo que corregir con un 42501 en vivo.

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseInvoiceTaxLineType" AS ENUM ('IVA_CREDITO', 'PERCEPCION');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "goodsReceiptId" TEXT,
ADD COLUMN     "purchaseInvoiceId" TEXT,
ADD COLUMN     "supplierPaymentId" TEXT,
ADD COLUMN     "supplierReturnId" TEXT;

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierTaxId" TEXT,
    "supplierInvoiceNumber" TEXT NOT NULL,
    "supplierInvoiceDate" TIMESTAMP(3) NOT NULL,
    "currencyId" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "balanceDue" DECIMAL(14,2) NOT NULL,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_tax_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "type" "PurchaseInvoiceTaxLineType" NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_invoice_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_receipts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,

    CONSTRAINT "purchase_invoice_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL,
    "financialAccountId" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" TEXT NOT NULL,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_invoices_tenantId_supplierId_idx" ON "purchase_invoices"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "purchase_invoices_tenantId_purchaseOrderId_idx" ON "purchase_invoices"("tenantId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_invoice_tax_lines_tenantId_idx" ON "purchase_invoice_tax_lines"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_invoice_receipts_tenantId_purchaseInvoiceId_idx" ON "purchase_invoice_receipts"("tenantId", "purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoice_receipts_tenantId_goodsReceiptId_key" ON "purchase_invoice_receipts"("tenantId", "goodsReceiptId");

-- CreateIndex
CREATE INDEX "supplier_payments_tenantId_purchaseInvoiceId_idx" ON "supplier_payments"("tenantId", "purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_goodsReceiptId_key" ON "journal_entries"("goodsReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_supplierReturnId_key" ON "journal_entries"("supplierReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_purchaseInvoiceId_key" ON "journal_entries"("purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_supplierPaymentId_key" ON "journal_entries"("supplierPaymentId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_tax_lines" ADD CONSTRAINT "purchase_invoice_tax_lines_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_receipts" ADD CONSTRAINT "purchase_invoice_receipts_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_receipts" ADD CONSTRAINT "purchase_invoice_receipts_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_financialAccountId_fkey" FOREIGN KEY ("financialAccountId") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT for the 4 new tenant-scoped tables, in THIS migration (not a
-- follow-up fix like 20260808000002_purchases_module_rls had to be).

ALTER TABLE "purchase_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoices" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_invoices"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_invoices" TO plexo_app;

ALTER TABLE "purchase_invoice_tax_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoice_tax_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_invoice_tax_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_invoice_tax_lines" TO plexo_app;

ALTER TABLE "purchase_invoice_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_invoice_receipts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_invoice_receipts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_invoice_receipts" TO plexo_app;

ALTER TABLE "supplier_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_payments"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "supplier_payments" TO plexo_app;
