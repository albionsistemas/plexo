-- AlterTable: optional CC mailbox for the overdue-reminder email (see
-- resolveEmailFrom/ReceivablesSchedulerService) - works with the existing
-- shared Resend sender, no domain verification needed.
ALTER TABLE "tenant_settings" ADD COLUMN "reminderCcEmail" TEXT;
