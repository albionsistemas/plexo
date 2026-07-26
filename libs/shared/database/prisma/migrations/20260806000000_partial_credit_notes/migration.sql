-- AlterTable: which invoice line this SALE_OUT movement came out of, so
-- voidSale can restock/re-cost just the credited quantity of one line
-- instead of the whole invoice.
ALTER TABLE "stock_movements" ADD COLUMN "invoiceLineId" TEXT;

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "stock_movements_invoiceLineId_idx" ON "stock_movements"("invoiceLineId");

-- AlterTable: one journal entry per credit note, resolved by creditNoteId
-- the same way the sale's entry is resolved by invoiceId - NOT via
-- reversalOfId, since a credit note posts its own independently-balanced
-- entry rather than a 100% mirror of a prior one (see AccountingService
-- .postCreditNoteJournalEntry).
ALTER TABLE "journal_entries" ADD COLUMN "creditNoteId" TEXT;

CREATE UNIQUE INDEX "journal_entries_creditNoteId_key" ON "journal_entries"("creditNoteId");

ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: one row per (InvoiceLine, credited quantity). A credit note
-- always targets specific invoice lines - crediting every line's full
-- quantity IS what used to be called "full reversal", same code path, no
-- separate concept. Multiple CreditNoteLine rows across different
-- CreditNotes can point at the same InvoiceLine (partial returns over
-- time) - InvoicingService.createCreditNote sums them to enforce that
-- total credited quantity never exceeds InvoiceLine.quantity.
CREATE TABLE "credit_note_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "taxAmount" DECIMAL(14,2) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "credit_note_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_note_lines_tenantId_idx" ON "credit_note_lines"("tenantId");

CREATE INDEX "credit_note_lines_invoiceLineId_idx" ON "credit_note_lines"("invoiceLineId");

ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "credit_notes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "credit_note_lines" ADD CONSTRAINT "credit_note_lines_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "invoice_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: same pattern as every other tenant-scoped table (see
-- row_level_security migration).
ALTER TABLE "credit_note_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_note_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "credit_note_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "credit_note_lines" TO plexo_app;

-- invoice_fiscal_lock (see 20260723000003_invoice_fiscal_lock) already
-- whitelists balanceDue/status/lastOverdueReminderAt as the only columns
-- allowed to change on an already-CAE'd invoice - createCreditNote's new
-- balanceDue/status update (mirrors recordReceipt's existing pattern)
-- needs no trigger change, it's already covered by that whitelist.
