-- CreateEnum
CREATE TYPE "InvoicePdfFormat" AS ENUM ('A4', 'A5', 'TICKET');

-- AlterTable: datos fiscales del emisor que faltaban para el PDF de
-- Facturación (ver InvoicePdfData en @plexo/invoicing) - Tenant.name/taxId
-- y TenantSettings.ownTaxCondition ya cubrían razón social/CUIT/condición
-- IVA, sólo faltaban estos tres. Nullable, sin backfill - el PDF omite la
-- línea si no está cargado.
ALTER TABLE "tenant_settings" ADD COLUMN     "fiscalAddress" TEXT,
ADD COLUMN     "grossIncomeNumber" TEXT,
ADD COLUMN     "activityStartDate" TIMESTAMP(3);

-- AlterTable: formato de papel por defecto para "Descargar PDF" en
-- Facturación (A4/A5/ticket angosto) - mismo criterio que
-- purchaseDocumentPdfStyle, overridable por descarga sin persistir.
ALTER TABLE "users" ADD COLUMN     "invoicePdfFormat" "InvoicePdfFormat" NOT NULL DEFAULT 'A4';
