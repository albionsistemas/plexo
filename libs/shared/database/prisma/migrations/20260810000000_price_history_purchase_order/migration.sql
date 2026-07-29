-- Pre-existing drift unrelated to this change (credit_note_lines FK,
-- stock_movements index, cosmetic customers->companies rename artifact)
-- stripped by hand, same as previous migrations - see
-- 20260808000000_add_purchases_module's comment for why.

-- AlterTable
ALTER TABLE "price_history" ADD COLUMN     "purchaseOrderId" TEXT;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
