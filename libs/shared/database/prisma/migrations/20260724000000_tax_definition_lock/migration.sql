-- tax_definitions are versioned (see the schema comment on the model):
-- a rate/calculation change never edits an existing row - it closes the
-- row's validTo and inserts a new one starting from that date, so
-- invoices already issued keep referencing whatever was true when they
-- were computed. This trigger makes that a DB-level guarantee instead of
-- just application discipline (TaxesService.reviseTaxDefinition): only
-- validTo/name/managedByAccountant may change on an existing row.
CREATE OR REPLACE FUNCTION tax_definition_version_lock() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code"
    OR NEW."calculationType" IS DISTINCT FROM OLD."calculationType"
    OR NEW."rate" IS DISTINCT FROM OLD."rate"
    OR NEW."fixedAmount" IS DISTINCT FROM OLD."fixedAmount"
    OR NEW."formula" IS DISTINCT FROM OLD."formula"
    OR NEW."validFrom" IS DISTINCT FROM OLD."validFrom"
  THEN
    RAISE EXCEPTION 'tax_definitions are versioned, not edited in place - only validTo/name/managedByAccountant may change on an existing row; revise() creates a new row for a rate change';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_definition_version_lock
  BEFORE UPDATE ON "tax_definitions"
  FOR EACH ROW EXECUTE FUNCTION tax_definition_version_lock();

-- Rate/definition changes affect every future invoice - worth the same
-- audit trail as the fiscal documents themselves.
CREATE TRIGGER audit_tax_definitions
  AFTER INSERT OR UPDATE OR DELETE ON "tax_definitions"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();
