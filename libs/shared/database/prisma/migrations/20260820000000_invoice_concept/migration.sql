-- CreateEnum
CREATE TYPE "InvoiceConcept" AS ENUM ('PRODUCTOS', 'SERVICIOS', 'PRODUCTOS_Y_SERVICIOS');

-- AlterTable: AFIP Concepto (1/2/3) de cada factura, derivado de
-- Article.isService de sus líneas al crearla - default PRODUCTOS para que
-- las facturas ya emitidas (todas artículos hasta ahora) queden correctas
-- sin backfill.
ALTER TABLE "invoices" ADD COLUMN "concept" "InvoiceConcept" NOT NULL DEFAULT 'PRODUCTOS';
