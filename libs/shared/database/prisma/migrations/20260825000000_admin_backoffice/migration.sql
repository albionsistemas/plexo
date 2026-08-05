-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable: eje administrativo separado de TenantSubscription.status
-- (ciclo de facturación) - ver el comentario en schema.prisma.
ALTER TABLE "tenants" ADD COLUMN "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable: global, deliberadamente SIN "tenantId" y SIN RLS más abajo
-- (mismo patrón que "plans") - GlobalExceptionFilter escribe acá antes de
-- que exista necesariamente un contexto de tenant.
CREATE TABLE "system_error_log" (
    "id" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_error_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_error_log_createdAt_idx" ON "system_error_log"("createdAt");

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable: global, sin RLS - ver el comentario en schema.prisma.
CREATE TABLE "database_backups" (
    "id" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "filePath" TEXT,
    "sizeBytes" BIGINT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "database_backups_pkey" PRIMARY KEY ("id")
);

-- "system_error_log"/"database_backups" son globales (sin tenantId) - a
-- diferencia de toda otra tabla nueva de este proyecto, deliberadamente
-- SIN bloque RLS, mismo criterio ya documentado para "plans". Sin DELETE
-- para system_error_log (append-only); database_backups sí necesita
-- DELETE para la rotación FIFO que hace BackupSchedulerService.
GRANT SELECT, INSERT, UPDATE ON "system_error_log" TO plexo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "database_backups" TO plexo_app;
