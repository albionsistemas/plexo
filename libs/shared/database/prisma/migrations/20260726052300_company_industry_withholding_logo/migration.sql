-- CreateEnum
CREATE TYPE "CompanyIndustry" AS ENUM ('COMERCIO', 'SERVICIOS', 'INDUSTRIA', 'CONSTRUCCION', 'AGRO', 'TECNOLOGIA', 'SALUD', 'EDUCACION', 'GASTRONOMIA', 'TRANSPORTE', 'INMOBILIARIO', 'OTRO');

-- Fixes drift left by 20260728000000_companies_and_people: `ALTER TABLE
-- customers RENAME TO companies` renames the table but Postgres does not
-- rename the constraint/index that came along with it, so they stay
-- "customers_*" forever unless renamed explicitly - do it now, since
-- schema.prisma's naming assumes "companies_*".
ALTER TABLE "companies" RENAME CONSTRAINT "customers_pkey" TO "companies_pkey";
ALTER INDEX "customers_tenantId_idx" RENAME TO "companies_tenantId_idx";

-- AlterTable
ALTER TABLE "companies"
  ADD COLUMN     "industry" "CompanyIndustry",
  ADD COLUMN     "grossIncomeNumber" TEXT,
  ADD COLUMN     "withholdsVat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "withholdsIncomeTax" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "withholdsGrossIncome" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "logoUrl" TEXT;
