-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN     "documentLetter" "DocumentLetter",
ADD COLUMN     "pointOfSale" TEXT,
ADD COLUMN     "number" TEXT;

-- AlterTable
ALTER TABLE "purchase_credit_notes" ADD COLUMN     "documentLetter" "DocumentLetter",
ADD COLUMN     "pointOfSale" TEXT,
ADD COLUMN     "number" TEXT;

-- AlterTable
ALTER TABLE "purchase_invoice_tax_lines" ADD COLUMN     "taxType" "WithholdingTaxType";

-- AlterTable
ALTER TABLE "purchase_credit_note_tax_lines" ADD COLUMN     "taxType" "WithholdingTaxType";
