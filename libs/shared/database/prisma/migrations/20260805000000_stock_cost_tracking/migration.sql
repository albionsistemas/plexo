-- AlterTable
-- Weighted-average cost tracking (PPP). Both columns nullable, no backfill:
-- existing rows had no cost basis before this feature.
ALTER TABLE "stock_ledger" ADD COLUMN "avgUnitCost" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "unitCost" DECIMAL(14,4);
