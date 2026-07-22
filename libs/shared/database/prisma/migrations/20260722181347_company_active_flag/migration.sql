-- AlterTable
-- Only the new column - deliberately not touching the customers_pkey /
-- customers_tenantId_idx names left over from the customers->companies
-- rename (20260728000000_companies_and_people renamed the TABLE, which in
-- Postgres does not rename its constraints/indexes along with it; that's
-- purely cosmetic naming drift, unrelated to this change - Prisma's
-- auto-generated diff tried to "fix" it bundled into this same ALTER TABLE
-- statement, which Postgres rejects since RENAME CONSTRAINT can't be
-- combined with other clauses in one statement).
ALTER TABLE "companies" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
