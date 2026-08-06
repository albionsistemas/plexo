-- El diff automático de `prisma migrate dev` también proponía soltar
-- credit_note_lines_tenantId_fkey / stock_movements_invoiceLineId_idx -
-- drift cosmético preexistente y no relacionado con esto (mismo artefacto
-- ya señalado y descartado a mano en 20260808000000_add_purchases_module).
-- Descartado a mano otra vez, esta migración queda acotada a auth.

-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- AlterTable: null = todavía no verificado. El signup público deja el
-- usuario en este estado hasta pasar por /auth/verify-email; login lo
-- bloquea mientras tanto (ver AuthService.login). Backfill abajo para que
-- ninguna cuenta ya existente (seed, admin backoffice, sesiones previas)
-- quede bloqueada retroactivamente.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "users" SET "emailVerifiedAt" = "createdAt";

-- CreateTable: un código activo por usuario (userId único) - reenviar
-- sobreescribe el mismo row en vez de acumular filas viejas. codeHash es
-- sha256 (no bcrypt) porque la defensa real es attemptCount, no el costo de
-- hashing - el código sólo vive OTP_EXPIRY_MINUTES.
CREATE TABLE "email_verification_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: append-only a propósito (a diferencia de la de arriba) - un
-- link de reseteo sin clickear no debe desaparecer, usedAt lo invalida sin
-- borrarlo. AuthService.forgotPassword marca como usado cualquier token
-- previo sin usar del mismo usuario al crear uno nuevo.
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable: 0, 1 o 2 filas por usuario (un provider vinculado como mucho
-- una vez). providerAccountId es el id estable que entrega cada proveedor
-- (el "sub" de Google, el "oid" de Microsoft) - nunca el email, que puede
-- cambiar del lado del proveedor sin que la cuenta deje de ser la misma.
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_codes_userId_key" ON "email_verification_codes"("userId");
CREATE INDEX "email_verification_codes_tenantId_idx" ON "email_verification_codes"("tenantId");

CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_tenantId_idx" ON "password_reset_tokens"("tenantId");

CREATE INDEX "oauth_accounts_tenantId_idx" ON "oauth_accounts"("tenantId");
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: mismo patrón que toda otra tabla tenant-scoped nueva (ver
-- 20260824000000_plans_and_subscriptions) - las 3 tablas son tenant-scoped.
ALTER TABLE "email_verification_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_verification_codes" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "email_verification_codes"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "email_verification_codes" TO plexo_app;

ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "password_reset_tokens"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "password_reset_tokens" TO plexo_app;

ALTER TABLE "oauth_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oauth_accounts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "oauth_accounts"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "oauth_accounts" TO plexo_app;

-- Funciones SECURITY DEFINER para resolver "a qué tenant(s) pertenece este
-- email" y "qué cuenta OAuth es esta" ANTES de que exista contexto de
-- tenant (login/signup corren pre-auth, igual que list_tenant_ids() - ver
-- 20260726000000_list_tenant_ids_function, mismo mecanismo y mismo nivel de
-- confianza). Sólo exponen exactamente estas dos consultas a plexo_app,
-- nada más amplio.
CREATE FUNCTION find_tenants_by_email(p_email text)
RETURNS TABLE(tenant_id text, user_id text, tenant_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u."tenantId", u.id, t.name
  FROM users u JOIN tenants t ON t.id = u."tenantId"
  WHERE lower(u.email) = lower(p_email);
$$;

GRANT EXECUTE ON FUNCTION find_tenants_by_email(text) TO plexo_app;

CREATE FUNCTION find_tenant_by_oauth_account(p_provider text, p_provider_account_id text)
RETURNS TABLE(tenant_id text, user_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "tenantId", "userId" FROM oauth_accounts
  WHERE provider = p_provider::"OAuthProvider" AND "providerAccountId" = p_provider_account_id;
$$;

GRANT EXECUTE ON FUNCTION find_tenant_by_oauth_account(text, text) TO plexo_app;
