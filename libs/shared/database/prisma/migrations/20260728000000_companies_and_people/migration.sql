-- Unifies Customer into the broader Company concept (a company can be a
-- CUSTOMER, a SUPPLIER, and/or one of the tenant's own BRANCH/points of
-- sale, all at once - see CompanyRole). Renaming (not drop+recreate)
-- preserves every existing row, FK, index, RLS policy, and grant, since
-- all of those attach to the table's OID, not its name.
ALTER TABLE "customers" RENAME TO "companies";
ALTER TABLE "companies" ADD COLUMN "pointOfSaleNumber" TEXT;

CREATE TYPE "CompanyRoleType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'BRANCH');

CREATE TABLE "company_roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "CompanyRoleType" NOT NULL,

    CONSTRAINT "company_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_roles_tenantId_companyId_role_key" ON "company_roles"("tenantId", "companyId", "role");
CREATE INDEX "company_roles_tenantId_role_idx" ON "company_roles"("tenantId", "role");

ALTER TABLE "company_roles" ADD CONSTRAINT "company_roles_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every row that existed as a "customer" before this migration keeps
-- being one - this is what makes the rename backward-compatible for
-- Invoicing/Receivables/Reports, which all still filter/display exactly
-- who they did before.
INSERT INTO "company_roles" ("id", "tenantId", "companyId", "role")
SELECT gen_random_uuid()::text, "tenantId", "id", 'CUSTOMER' FROM "companies";

CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "nickname" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "avatarUrl" TEXT,
    "jobTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "people_tenantId_companyId_idx" ON "people"("tenantId", "companyId");

ALTER TABLE "people" ADD CONSTRAINT "people_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS on the two new tables, same tenant_isolation pattern as everything
-- else (see the row_level_security migration). "companies" itself is
-- already covered - renaming didn't touch its existing policy/grants.
ALTER TABLE "company_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_roles" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "company_roles"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "people" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "people"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "company_roles" TO plexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "people" TO plexo_app;
