/*
  Warnings:

  - The `status` column on the `quotes` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `createdByUserId` to the `quotes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `currencyId` to the `quotes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteSendChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- AlterTable
ALTER TABLE "quote_lines" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdByUserId" TEXT NOT NULL,
ADD COLUMN     "currencyId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "sentVia" "QuoteSendChannel",
DROP COLUMN "status",
ADD COLUMN     "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "quoteNextNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "quotePdfStyle" "PdfStyle" NOT NULL DEFAULT 'MODERNO',
ADD COLUMN     "quotePrefix" TEXT NOT NULL DEFAULT 'PRE';

-- CreateIndex
CREATE INDEX "quotes_tenantId_idx" ON "quotes"("tenantId");

-- CreateIndex
CREATE INDEX "quotes_tenantId_customerId_idx" ON "quotes"("tenantId", "customerId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
