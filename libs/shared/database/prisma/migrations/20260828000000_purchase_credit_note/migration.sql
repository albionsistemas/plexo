-- Nota de Crédito de Compra (PurchaseCreditNote) - la NC que el proveedor
-- emite al tenant contra una PurchaseInvoice ya cargada (descuento,
-- corrección de precio, error de facturación), distinta de SupplierReturn
-- (devolución física). Header-level, igual que PurchaseInvoice. RLS+GRANT
-- incluidos en esta misma migración, mismo criterio que
-- 20260813000000_accounts_payable_purchase_invoice.

-- CreateEnum
CREATE TYPE "PurchaseCreditNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "purchaseCreditNoteId" TEXT;

-- CreateTable
CREATE TABLE "purchase_credit_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseInvoiceId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierTaxId" TEXT,
    "supplierCreditNoteNumber" TEXT NOT NULL,
    "supplierCreditNoteDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "taxTotal" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "status" "PurchaseCreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "supplierReturnId" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_credit_note_tax_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseCreditNoteId" TEXT NOT NULL,
    "type" "PurchaseInvoiceTaxLineType" NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_credit_note_tax_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_credit_notes_tenantId_purchaseInvoiceId_idx" ON "purchase_credit_notes"("tenantId", "purchaseInvoiceId");

-- CreateIndex
CREATE INDEX "purchase_credit_notes_tenantId_supplierId_idx" ON "purchase_credit_notes"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "purchase_credit_notes_tenantId_supplierReturnId_idx" ON "purchase_credit_notes"("tenantId", "supplierReturnId");

-- CreateIndex
CREATE INDEX "purchase_credit_note_tax_lines_tenantId_idx" ON "purchase_credit_note_tax_lines"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_purchaseCreditNoteId_key" ON "journal_entries"("purchaseCreditNoteId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_purchaseCreditNoteId_fkey" FOREIGN KEY ("purchaseCreditNoteId") REFERENCES "purchase_credit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_note_tax_lines" ADD CONSTRAINT "purchase_credit_note_tax_lines_purchaseCreditNoteId_fkey" FOREIGN KEY ("purchaseCreditNoteId") REFERENCES "purchase_credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + GRANT for the 2 new tenant-scoped tables, in THIS migration (not a
-- follow-up fix) - same setting/role as every other tenant-scoped table,
-- see 20260813000000_accounts_payable_purchase_invoice.

ALTER TABLE "purchase_credit_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_credit_notes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_credit_notes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_credit_notes" TO plexo_app;

ALTER TABLE "purchase_credit_note_tax_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_credit_note_tax_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "purchase_credit_note_tax_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "purchase_credit_note_tax_lines" TO plexo_app;
