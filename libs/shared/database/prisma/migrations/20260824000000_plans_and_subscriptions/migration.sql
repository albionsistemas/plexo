-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED');

-- AlterTable: usuario recién invitado (ver UsersService.inviteUser) hasta
-- que pase por /auth/change-password (ver MustChangePasswordGuard).
ALTER TABLE "users" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: catálogo global de planes - deliberadamente SIN "tenantId"
-- y SIN RLS más abajo, a diferencia de cualquier otra tabla de este schema
-- (ver el comentario en schema.prisma sobre Plan).
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "priceMonthly" DECIMAL(14,2) NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxClients" INTEGER NOT NULL,
    "maxMonthlyInvoices" INTEGER NOT NULL,
    "debitDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable: una por tenant (mismo patrón 1:1 que tenant_settings) - a
-- diferencia de "plans", SÍ es tenant-scoped y gana su propio bloque RLS
-- más abajo.
CREATE TABLE "tenant_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "promoLabel" TEXT,
    "promoDiscountPercent" DECIMAL(5,2),
    "promoExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_subscriptions_tenantId_key" ON "tenant_subscriptions"("tenantId");

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mismo patrón que toda otra tabla tenant-scoped nueva (ver
-- 20260822000000_inventory_cart_item) - "tenant_subscriptions" es tenant-
-- scoped, así que la necesita.
ALTER TABLE "tenant_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_subscriptions"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_subscriptions" TO plexo_app;

-- "plans" es global (sin RLS, ver arriba) - se le da a plexo_app lectura +
-- alta/edición (para /api/admin/plans), sin DELETE (los planes se retiran
-- con isActive=false, nunca se borran - una TenantSubscription vieja puede
-- seguir apuntando a uno).
GRANT SELECT, INSERT, UPDATE ON "plans" TO plexo_app;

-- Seed: los 6 planes comerciales confirmados. debitDiscountPercent queda en
-- 0 para los 6 (sin porcentajes definidos todavía) - editable después vía
-- /api/admin/plans sin tocar código, que es justamente el punto de esta
-- tabla.
INSERT INTO "plans" ("id", "key", "name", "sortOrder", "priceMonthly", "maxUsers", "maxClients", "maxMonthlyInvoices", "updatedAt") VALUES
  (gen_random_uuid()::text, 'BASIC',    'Basic Gratis', 1, 0,      1,  1,   200,   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'BRONZE',   'Bronze',       2, 118789, 2,  20,  400,   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'SILVER',   'Silver',       3, 176439, 4,  50,  1000,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'GOLD',     'Gold',         4, 227449, 6,  75,  3000,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PLATINUM', 'Platinum',     5, 284399, 8,  100, 5000,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DIAMOND',  'Diamond',      6, 427109, 50, 500, 50000, CURRENT_TIMESTAMP);

-- Backfill: todo tenant que ya existía antes de este módulo queda ACTIVE en
-- el plan más alto (Diamond) en vez de arrancar un Trial de 7 días que
-- nacería vencido - corre como el rol de migración (bypasea RLS), no hace
-- falta iterar tenant por tenant con set_config.
INSERT INTO "tenant_subscriptions" ("id", "tenantId", "planId", "status", "updatedAt")
SELECT gen_random_uuid()::text, "id", (SELECT "id" FROM "plans" WHERE "key" = 'DIAMOND'), 'ACTIVE', CURRENT_TIMESTAMP
FROM "tenants";
