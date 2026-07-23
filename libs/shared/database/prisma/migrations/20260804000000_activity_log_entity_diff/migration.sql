-- AlterTable: entity-level before/after diff for routes decorated with
-- @AuditEntity (see audit-entity.decorator.ts) - undecorated mutating
-- routes keep writing the plain "METHOD /url" action with these columns
-- left null.
ALTER TABLE "user_activity_log"
  ADD COLUMN "entityType" TEXT,
  ADD COLUMN "entityId" TEXT,
  ADD COLUMN "entityLabel" TEXT,
  ADD COLUMN "changes" JSONB;

CREATE INDEX "user_activity_log_tenantId_userId_createdAt_idx"
  ON "user_activity_log" ("tenantId", "userId", "createdAt");
CREATE INDEX "user_activity_log_tenantId_entityType_entityId_idx"
  ON "user_activity_log" ("tenantId", "entityType", "entityId");
