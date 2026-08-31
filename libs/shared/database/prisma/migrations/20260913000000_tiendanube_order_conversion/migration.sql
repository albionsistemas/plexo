-- AlterTable: campos poblados sólo al convertir un TiendanubeOrder a venta
-- (endpoint de conversión, Fase 2 cont.) - ver el doc comment del modelo.
ALTER TABLE "tiendanube_orders" ADD COLUMN "convertedAt" TIMESTAMP(3);
ALTER TABLE "tiendanube_orders" ADD COLUMN "convertedInvoiceId" TEXT;
