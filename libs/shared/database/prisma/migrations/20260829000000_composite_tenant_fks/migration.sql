-- Cierra la fuga de RLS vía Foreign Key cruzada documentada en PROGRESS.md
-- ("PENDIENTE URGENTE" del 2026-08-12): los FK de Postgres no respetan RLS,
-- así que hasta ahora se podía crear (por ej.) una PurchaseCreditNote en el
-- tenant A apuntando a una PurchaseInvoice del tenant B. Fase 1: 22
-- relaciones fiscales/financieras pasan de FK simple (xId -> id) a FK
-- compuesta (tenantId, xId) -> (tenantId, id) - el FK sólo matchea si el
-- padre pertenece al mismo tenant. Requiere @@unique([tenantId, id]) en
-- cada modelo padre (11 en total; JournalEntry además necesita un
-- @@unique([tenantId, xId]) por cada una de sus 8 relaciones opcionales,
-- ya que Prisma exige un índice único que calce exacto con las columnas
-- del FK en una relación 1-a-1).
--
-- Desviación deliberada del plan original: las 8 relaciones opcionales de
-- JournalEntry (invoiceId, creditNoteId, goodsReceiptId, supplierReturnId,
-- purchaseInvoiceId, purchaseCreditNoteId, supplierPaymentId, receiptId)
-- tenían ON DELETE SET NULL antes de esta migración. Con FK compuesta eso
-- ya no es seguro: Postgres seteo SET NULL anula TODAS las columnas del FK,
-- incluida tenantId, que es NOT NULL - reventaría en el momento en que
-- alguna vez se dispare. Postgres 15+ soporta "ON DELETE SET NULL (col)"
-- para nulear sólo una columna, pero Prisma no sabe generar esa sintaxis
-- (falla su propia validación si se declara onDelete: SetNull acá). Se
-- optó por ON DELETE RESTRICT en las 22 relaciones, sin excepción. Impacto
-- real nulo: ningún service de la app hace hard-delete de Invoice /
-- CreditNote / PurchaseInvoice / PurchaseCreditNote / SupplierPayment /
-- Receipt / GoodsReceipt / SupplierReturn (son documentos fiscales,
-- inmutables por diseño - ver JournalEntry en schema.prisma). RESTRICT es,
-- si acaso, más correcto que SET NULL para este caso.

-- DropForeignKey
ALTER TABLE "credit_note_lines" DROP CONSTRAINT "credit_note_lines_invoiceLineId_fkey";

-- DropForeignKey
ALTER TABLE "credit_notes" DROP CONSTRAINT "credit_notes_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_creditNoteId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_goodsReceiptId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_purchaseCreditNoteId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_receiptId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_supplierPaymentId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entries" DROP CONSTRAINT "journal_entries_supplierReturnId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "journal_entry_lines_accountId_fkey";

-- DropForeignKey
ALTER TABLE "journal_entry_lines" DROP CONSTRAINT "journal_entry_lines_journalEntryId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_credit_note_tax_lines" DROP CONSTRAINT "purchase_credit_note_tax_lines_purchaseCreditNoteId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_credit_notes" DROP CONSTRAINT "purchase_credit_notes_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_credit_notes" DROP CONSTRAINT "purchase_credit_notes_supplierReturnId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoice_receipts" DROP CONSTRAINT "purchase_invoice_receipts_goodsReceiptId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoice_receipts" DROP CONSTRAINT "purchase_invoice_receipts_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "purchase_invoice_tax_lines" DROP CONSTRAINT "purchase_invoice_tax_lines_purchaseInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "receipts" DROP CONSTRAINT "receipts_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_payment_withholdings" DROP CONSTRAINT "supplier_payment_withholdings_supplierPaymentId_fkey";

-- DropForeignKey
ALTER TABLE "supplier_payments" DROP CONSTRAINT "supplier_payments_purchaseInvoiceId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "accounting_accounts_tenantId_id_key" ON "accounting_accounts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_tenantId_id_key" ON "credit_notes"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenantId_id_key" ON "goods_receipts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenantId_id_key" ON "invoice_lines"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenantId_id_key" ON "invoices"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_id_key" ON "journal_entries"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_invoiceId_key" ON "journal_entries"("tenantId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_creditNoteId_key" ON "journal_entries"("tenantId", "creditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_goodsReceiptId_key" ON "journal_entries"("tenantId", "goodsReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_supplierReturnId_key" ON "journal_entries"("tenantId", "supplierReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_purchaseInvoiceId_key" ON "journal_entries"("tenantId", "purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_purchaseCreditNoteId_key" ON "journal_entries"("tenantId", "purchaseCreditNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_supplierPaymentId_key" ON "journal_entries"("tenantId", "supplierPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_tenantId_receiptId_key" ON "journal_entries"("tenantId", "receiptId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_credit_notes_tenantId_id_key" ON "purchase_credit_notes"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_tenantId_id_key" ON "purchase_invoices"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_tenantId_id_key" ON "receipts"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_tenantId_id_key" ON "supplier_payments"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_tenantId_id_key" ON "supplier_returns"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_tenantId_invoiceLineId_fkey" FOREIGN KEY ("tenantId", "invoiceLineId") REFERENCES "invoice_lines"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_invoiceId_fkey" FOREIGN KEY ("tenantId", "invoiceId") REFERENCES "invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_creditNoteId_fkey" FOREIGN KEY ("tenantId", "creditNoteId") REFERENCES "credit_notes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_goodsReceiptId_fkey" FOREIGN KEY ("tenantId", "goodsReceiptId") REFERENCES "goods_receipts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_supplierReturnId_fkey" FOREIGN KEY ("tenantId", "supplierReturnId") REFERENCES "supplier_returns"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_purchaseInvoiceId_fkey" FOREIGN KEY ("tenantId", "purchaseInvoiceId") REFERENCES "purchase_invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_purchaseCreditNoteId_fkey" FOREIGN KEY ("tenantId", "purchaseCreditNoteId") REFERENCES "purchase_credit_notes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_supplierPaymentId_fkey" FOREIGN KEY ("tenantId", "supplierPaymentId") REFERENCES "supplier_payments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_tenantId_receiptId_fkey" FOREIGN KEY ("tenantId", "receiptId") REFERENCES "receipts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_tenantId_journalEntryId_fkey" FOREIGN KEY ("tenantId", "journalEntryId") REFERENCES "journal_entries"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_tenantId_accountId_fkey" FOREIGN KEY ("tenantId", "accountId") REFERENCES "accounting_accounts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_withholdings" ADD CONSTRAINT "supplier_payment_withholdings_tenantId_supplierPaymentId_fkey" FOREIGN KEY ("tenantId", "supplierPaymentId") REFERENCES "supplier_payments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_tax_lines" ADD CONSTRAINT "purchase_invoice_tax_lines_tenantId_purchaseInvoiceId_fkey" FOREIGN KEY ("tenantId", "purchaseInvoiceId") REFERENCES "purchase_invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_receipts" ADD CONSTRAINT "purchase_invoice_receipts_tenantId_purchaseInvoiceId_fkey" FOREIGN KEY ("tenantId", "purchaseInvoiceId") REFERENCES "purchase_invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_receipts" ADD CONSTRAINT "purchase_invoice_receipts_tenantId_goodsReceiptId_fkey" FOREIGN KEY ("tenantId", "goodsReceiptId") REFERENCES "goods_receipts"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_tenantId_purchaseInvoiceId_fkey" FOREIGN KEY ("tenantId", "purchaseInvoiceId") REFERENCES "purchase_invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_notes" ADD CONSTRAINT "purchase_credit_notes_tenantId_supplierReturnId_fkey" FOREIGN KEY ("tenantId", "supplierReturnId") REFERENCES "supplier_returns"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_credit_note_tax_lines" ADD CONSTRAINT "purchase_credit_note_tax_lines_tenantId_purchaseCreditNote_fkey" FOREIGN KEY ("tenantId", "purchaseCreditNoteId") REFERENCES "purchase_credit_notes"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenantId_purchaseInvoiceId_fkey" FOREIGN KEY ("tenantId", "purchaseInvoiceId") REFERENCES "purchase_invoices"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
