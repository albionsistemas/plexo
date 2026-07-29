-- AlterEnum
ALTER TYPE "MovementType" ADD VALUE 'SUPPLIER_RETURN';

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "returnedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierReturnId" TEXT NOT NULL,
    "goodsReceiptLineId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_returns_tenantId_goodsReceiptId_idx" ON "supplier_returns"("tenantId", "goodsReceiptId");

-- CreateIndex
CREATE INDEX "supplier_return_lines_tenantId_idx" ON "supplier_return_lines"("tenantId");

-- CreateIndex
CREATE INDEX "supplier_return_lines_goodsReceiptLineId_idx" ON "supplier_return_lines"("goodsReceiptLineId");

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_returnedByUserId_fkey" FOREIGN KEY ("returnedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_supplierReturnId_fkey" FOREIGN KEY ("supplierReturnId") REFERENCES "supplier_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_goodsReceiptLineId_fkey" FOREIGN KEY ("goodsReceiptLineId") REFERENCES "goods_receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS + plexo_app grants for the 2 new tenant-scoped tables, in the SAME
-- migration that creates them (see goods_receipts' own migration comment
-- for why this repo doesn't defer it to a follow-up anymore).
ALTER TABLE "supplier_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_returns" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_returns"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "supplier_returns" TO plexo_app;

ALTER TABLE "supplier_return_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "supplier_return_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "supplier_return_lines"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "supplier_return_lines" TO plexo_app;
