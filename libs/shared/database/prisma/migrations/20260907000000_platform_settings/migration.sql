-- CreateTable: fila única de config global (id fijo 'global', ver
-- PlatformSettings en schema.prisma) - deliberadamente SIN "tenantId" y SIN
-- RLS más abajo, mismo criterio que "plans".
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "bnaSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bnaSyncHour" INTEGER NOT NULL DEFAULT 9,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- "platform_settings" es global (sin RLS, ver arriba) - se le da a
-- plexo_app lectura + alta/edición (para /api/admin/bna-sync), sin DELETE
-- (fila única, nunca se borra).
GRANT SELECT, INSERT, UPDATE ON "platform_settings" TO plexo_app;

-- Seed: la única fila, con los defaults del schema.
INSERT INTO "platform_settings" ("id", "bnaSyncEnabled", "bnaSyncHour", "updatedAt")
VALUES ('global', true, 9, CURRENT_TIMESTAMP);
