-- CreateEnum
CREATE TYPE "TenantTaxCondition" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO');

-- AlterTable: condición IVA propia del tenant (quien emite), no la del
-- cliente - determina qué letra de comprobante (A/B/C) es fiscalmente
-- válida. Nullable a propósito: sin este dato configurado, la UI no puede
-- derivar la letra con certeza y cae a selección manual.
ALTER TABLE "tenant_settings" ADD COLUMN "ownTaxCondition" "TenantTaxCondition";
