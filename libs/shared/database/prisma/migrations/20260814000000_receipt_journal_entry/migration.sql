-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "receiptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_receiptId_key" ON "journal_entries"("receiptId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
