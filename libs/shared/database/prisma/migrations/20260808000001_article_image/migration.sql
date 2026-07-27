-- Pre-existing drift unrelated to this change (credit_note_lines FK,
-- stock_movements index, cosmetic customers->companies rename artifact)
-- stripped by hand, same as 20260808000000_add_purchases_module - see that
-- migration's comment for why.

-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "imageUrl" TEXT;
