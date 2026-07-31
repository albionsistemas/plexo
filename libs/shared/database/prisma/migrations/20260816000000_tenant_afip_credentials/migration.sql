-- CreateEnum
CREATE TYPE "AfipEnvironment" AS ENUM ('HOMOLOGACION', 'PRODUCCION');

-- AlterTable: certificado/clave AFIP por tenant (cifrados con
-- EncryptionService, AES-256-GCM), reemplazando las variables de entorno
-- globales AFIP_CERT_PATH/AFIP_KEY_PATH/AFIP_ENV - un solo CUIT para toda
-- la instancia, incompatible con multi-tenant.
ALTER TABLE "tenant_settings" ADD COLUMN "afipEnv" "AfipEnvironment" NOT NULL DEFAULT 'HOMOLOGACION';
ALTER TABLE "tenant_settings" ADD COLUMN "afipCertEncrypted" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipKeyEncrypted" TEXT;
ALTER TABLE "tenant_settings" ADD COLUMN "afipCertExpiresAt" TIMESTAMP(3);
