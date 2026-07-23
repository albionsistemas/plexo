-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "arReminderIntervalDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_settings_tenantId_key" ON "tenant_settings"("tenantId");

ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: same pattern as every other tenant-scoped table (see
-- row_level_security migration and, for the "add RLS to a table created
-- after the initial rollout" precedent, companies_and_people).
ALTER TABLE "tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tenant_settings"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_settings" TO plexo_app;

-- AlterTable: track when an invoice last got an overdue-reminder email, so
-- recurring reminders (gated by tenant_settings.arReminderIntervalDays)
-- know whether "enough time" has passed since the last one - see
-- ReceivablesService.sendRecurringReminders.
ALTER TABLE "invoices" ADD COLUMN "lastOverdueReminderAt" TIMESTAMP(3);

-- invoice_fiscal_lock (see 20260723000003_invoice_fiscal_lock) whitelists
-- exactly which columns may still change on an already-CAE'd invoice.
-- lastOverdueReminderAt has to join that whitelist - it's set by the
-- reminder sweep on invoices that are, by definition, already issued.
-- Full CREATE OR REPLACE since Postgres has no ALTER FUNCTION for the body;
-- every other branch is unchanged from the original.
CREATE OR REPLACE FUNCTION invoice_fiscal_lock() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."afipCae" IS NOT NULL THEN
      RAISE EXCEPTION 'invoice % has a CAE and cannot be deleted - issue a CreditNote instead', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- OLD already had a CAE: this UPDATE is touching an issued invoice, so
  -- only balanceDue/status/lastOverdueReminderAt may actually differ.
  IF OLD."afipCae" IS NOT NULL THEN
    IF NEW."afipCae" IS DISTINCT FROM OLD."afipCae"
      OR NEW."afipCaeExpiry" IS DISTINCT FROM OLD."afipCaeExpiry"
      OR NEW."number" IS DISTINCT FROM OLD."number"
      OR NEW."pointOfSale" IS DISTINCT FROM OLD."pointOfSale"
      OR NEW."documentLetter" IS DISTINCT FROM OLD."documentLetter"
      OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
      OR NEW."customerName" IS DISTINCT FROM OLD."customerName"
      OR NEW."customerTaxId" IS DISTINCT FROM OLD."customerTaxId"
      OR NEW."currencyId" IS DISTINCT FROM OLD."currencyId"
      OR NEW."exchangeRate" IS DISTINCT FROM OLD."exchangeRate"
      OR NEW."globalDiscountPercent" IS DISTINCT FROM OLD."globalDiscountPercent"
      OR NEW."subtotal" IS DISTINCT FROM OLD."subtotal"
      OR NEW."taxTotal" IS DISTINCT FROM OLD."taxTotal"
      OR NEW."total" IS DISTINCT FROM OLD."total"
      OR NEW."issueDate" IS DISTINCT FROM OLD."issueDate"
      OR NEW."dueDate" IS DISTINCT FROM OLD."dueDate"
      OR NEW."issuedByUserId" IS DISTINCT FROM OLD."issuedByUserId"
    THEN
      RAISE EXCEPTION 'invoice % is fiscally locked (CAE already issued) - only balanceDue/status/lastOverdueReminderAt may change; corrections need a CreditNote', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
