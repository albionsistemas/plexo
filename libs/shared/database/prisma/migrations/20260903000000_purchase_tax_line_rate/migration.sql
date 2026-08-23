-- AlterTable
ALTER TABLE "purchase_invoice_tax_lines" ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "taxRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "purchase_credit_note_tax_lines" ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "taxRate" DECIMAL(5,2);
