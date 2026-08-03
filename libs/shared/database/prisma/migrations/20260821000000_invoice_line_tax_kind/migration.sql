-- AlterEnum: EXENTO/NO_GRAVADO - una TaxDefinition sin tasa/monto, para
-- artículos cuya venta no lleva IVA discriminado en absoluto (distinto de
-- PERCENTAGE con rate=0, que sí es "gravado al 0%" para AFIP).
ALTER TYPE "TaxCalculationType" ADD VALUE 'EXENTO';
ALTER TYPE "TaxCalculationType" ADD VALUE 'NO_GRAVADO';

-- CreateEnum
CREATE TYPE "TaxLineKind" AS ENUM ('GRAVADO', 'EXENTO', 'NO_GRAVADO');

-- AlterTable: cómo entra el netAmount de cada línea al pedido de AFIP
-- (Iva[]/ImpNeto vs. ImpOpEx vs. ImpTotConc) - default GRAVADO para que las
-- facturas ya emitidas (todas gravadas normalmente hasta ahora) queden
-- correctas sin backfill.
ALTER TABLE "invoice_lines" ADD COLUMN "taxKind" "TaxLineKind" NOT NULL DEFAULT 'GRAVADO';
