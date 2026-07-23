-- CreateEnum
CREATE TYPE "EmailSenderMode" AS ENUM ('SHARED', 'CUSTOM_DOMAIN');
CREATE TYPE "ReminderTone" AS ENUM ('FRIENDLY', 'NEUTRAL', 'FIRM');

-- AlterTable: per-tenant sender identity (custom domain, verified via
-- Resend's domains API under the app's single account - no per-tenant
-- secret needed, see resolveEmailFrom in @plexo/tenant-settings) + which of
-- the 3 preset wordings the overdue-reminder email uses. tenant_settings
-- already has FORCE ROW LEVEL SECURITY + the tenant_isolation policy from
-- its own migration, which covers these new columns automatically.
ALTER TABLE "tenant_settings"
  ADD COLUMN "emailSenderMode" "EmailSenderMode" NOT NULL DEFAULT 'SHARED',
  ADD COLUMN "emailFromName" TEXT,
  ADD COLUMN "emailFromLocalPart" TEXT,
  ADD COLUMN "emailCustomDomain" TEXT,
  ADD COLUMN "resendDomainId" TEXT,
  ADD COLUMN "domainStatus" TEXT,
  ADD COLUMN "reminderTone" "ReminderTone" NOT NULL DEFAULT 'NEUTRAL';
