-- CreateEnum
CREATE TYPE "PurchaseDocumentStatus" AS ENUM ('DRAFT', 'CONVERTED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseSendChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "PdfStyle" AS ENUM ('MODERNO', 'COMPACTO', 'TRADICIONAL', 'NATURAL', 'LETRAS_GRANDES');

-- The `prisma migrate diff` tool that generated this file also proposed
-- dropping credit_note_lines_tenantId_fkey / stock_movements_invoiceLineId_idx
-- and renaming customers_pkey/customers_tenantId_idx to companies_* -
-- pre-existing drift unrelated to this feature (same cosmetic
-- customers->companies rename artifact already called out and deliberately
-- left alone in the company_active_flag migration's own comment). Stripped
-- by hand, same as that migration did, to keep this one scoped to Compras.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "purchaseDocumentPdfStyle" "PdfStyle" NOT NULL DEFAULT 'MODERNO',
ADD COLUMN     "purchaseOrderNextNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "purchaseOrderPrefix" TEXT NOT NULL DEFAULT 'OC',
ADD COLUMN     "quoteRequestNextNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "quoteRequestPrefix" TEXT NOT NULL DEFAULT 'PED';

-- CreateTable
CREATE TABLE "transport_modes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "transport_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_times" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delivery_times_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PurchaseDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyId" TEXT NOT NULL,
    "transportModeId" TEXT,
    "paymentTermId" TEXT,
    "deliveryTimeId" TEXT,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "estimatedTotal" DECIMAL(14,2),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_request_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteRequestId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "estimatedUnitCost" DECIMAL(14,2),
    "notes" TEXT,

    CONSTRAINT "quote_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "quoteRequestId" TEXT,
    "status" "PurchaseDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currencyId" TEXT NOT NULL,
    "transportModeId" TEXT,
    "paymentTermId" TEXT,
    "deliveryTimeId" TEXT,
    "notes" TEXT,
    "total" DECIMAL(14,2) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "sentVia" "PurchaseSendChannel",
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "articleVariantId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transport_modes_tenantId_idx" ON "transport_modes"("tenantId");

-- CreateIndex
CREATE INDEX "payment_terms_tenantId_idx" ON "payment_terms"("tenantId");

-- CreateIndex
CREATE INDEX "delivery_times_tenantId_idx" ON "delivery_times"("tenantId");

-- CreateIndex
CREATE INDEX "quote_requests_tenantId_supplierId_idx" ON "quote_requests"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_requests_tenantId_number_key" ON "quote_requests"("tenantId", "number");

-- CreateIndex
CREATE INDEX "quote_request_lines_tenantId_idx" ON "quote_request_lines"("tenantId");

-- CreateIndex
CREATE INDEX "purchase_orders_tenantId_supplierId_idx" ON "purchase_orders"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenantId_number_key" ON "purchase_orders"("tenantId", "number");

-- CreateIndex
CREATE INDEX "purchase_order_lines_tenantId_idx" ON "purchase_order_lines"("tenantId");

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_transportModeId_fkey" FOREIGN KEY ("transportModeId") REFERENCES "transport_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_deliveryTimeId_fkey" FOREIGN KEY ("deliveryTimeId") REFERENCES "delivery_times"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_lines" ADD CONSTRAINT "quote_request_lines_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_lines" ADD CONSTRAINT "quote_request_lines_articleVariantId_fkey" FOREIGN KEY ("articleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "quote_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES "currencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_transportModeId_fkey" FOREIGN KEY ("transportModeId") REFERENCES "transport_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_deliveryTimeId_fkey" FOREIGN KEY ("deliveryTimeId") REFERENCES "delivery_times"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_articleVariantId_fkey" FOREIGN KEY ("articleVariantId") REFERENCES "article_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

