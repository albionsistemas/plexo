-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'PURCHASES';

-- DropForeignKey
ALTER TABLE "credit_note_lines" DROP CONSTRAINT "credit_note_lines_tenantId_fkey";

-- DropIndex
DROP INDEX "stock_movements_invoiceLineId_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invitedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_invitations_tenantId_idx" ON "team_invitations"("tenantId");

-- CreateIndex
CREATE INDEX "team_invitations_tokenHash_idx" ON "team_invitations"("tokenHash");

-- RLS: mismo patrón que toda otra tabla tenant-scoped nueva (ver
-- 20260826000000_auth_onboarding) - Prisma no genera esto solo, hay que
-- agregarlo a mano en cada migración que crea una tabla tenant-scoped.
ALTER TABLE "team_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "team_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "team_invitations"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "team_invitations" TO plexo_app;
