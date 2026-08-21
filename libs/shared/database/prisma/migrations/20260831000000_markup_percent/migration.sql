-- AlterTable
ALTER TABLE "articles" ADD COLUMN     "markupPercent" DECIMAL(6,2);

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "defaultMarkupPercent" DECIMAL(6,2);

