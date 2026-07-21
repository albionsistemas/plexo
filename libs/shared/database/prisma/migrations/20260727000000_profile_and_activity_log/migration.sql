-- Profile fields: display name + avatar (URL only - no file storage
-- infra exists in this project yet) + an opt-in toggle for whether this
-- user's online/offline presence is broadcast to tenant-mates over the
-- dashboard WebSocket (see DashboardGateway).
ALTER TABLE "users" ADD COLUMN "name" TEXT;
ALTER TABLE "users" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "users" ADD COLUMN "showOnlinePresence" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "ActivityOutcome" AS ENUM ('SUCCESS', 'FAILURE');

-- Application-level activity log: who did what, when, from which IP, and
-- whether it succeeded. Distinct from audit_log (a DB-trigger row-change
-- log with no IP/session info - only visible at the HTTP layer).
CREATE TABLE "user_activity_log" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" "ActivityOutcome" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_activity_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_activity_log_tenantId_createdAt_idx" ON "user_activity_log"("tenantId", "createdAt");

ALTER TABLE "user_activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_activity_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "user_activity_log"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- Append-only, like audit_log: INSERT/SELECT only, no UPDATE/DELETE grant
-- at all (not granted then revoked - just never granted).
GRANT SELECT, INSERT ON "user_activity_log" TO plexo_app;
