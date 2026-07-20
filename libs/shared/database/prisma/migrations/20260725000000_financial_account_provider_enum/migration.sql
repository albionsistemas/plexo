-- provider was a free-text string (typo-prone: "MERCADO_PAGO" vs
-- "MERCADOPAGO" would silently split the same provider into two buckets
-- in any report grouping by it). No data exists anywhere to migrate, so
-- this is a straight column type change, not a backfill.
CREATE TYPE "FinancialAccountProvider" AS ENUM ('BANK', 'MERCADOPAGO', 'PAYPAL', 'CASH');

ALTER TABLE "financial_accounts"
  ALTER COLUMN "provider" TYPE "FinancialAccountProvider"
  USING ("provider"::"FinancialAccountProvider");

CREATE UNIQUE INDEX "financial_accounts_tenantId_name_key" ON "financial_accounts"("tenantId", "name");
CREATE INDEX "financial_accounts_tenantId_idx" ON "financial_accounts"("tenantId");
