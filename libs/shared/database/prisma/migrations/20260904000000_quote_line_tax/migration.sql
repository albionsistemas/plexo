-- AlterTable
ALTER TABLE "quote_lines" ADD COLUMN     "taxRate" DECIMAL(5,2),
ADD COLUMN     "taxKind" "TaxLineKind",
ADD COLUMN     "netAmount" DECIMAL(14,2),
ADD COLUMN     "lineTotal" DECIMAL(14,2);
