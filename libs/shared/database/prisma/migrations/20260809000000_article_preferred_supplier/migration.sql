-- Pre-existing drift unrelated to this change (credit_note_lines FK,
-- stock_movements index, cosmetic customers->companies rename artifact)
-- stripped by hand, same as previous migrations - see
-- 20260808000000_add_purchases_module's comment for why.

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "preferredSupplierId" TEXT;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
