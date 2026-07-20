-- Once an Invoice has a CAE, it is fiscally issued and AFIP-facing data
-- cannot change retroactively - a correction is a CreditNote referencing
-- it, never an UPDATE. balanceDue/status are the only columns that may
-- still move afterward (that's how receipts keep working post-issuance).
--
-- This is layered on top of the generic audit_log_capture() trigger from
-- the previous migration: that one records every change; this one decides
-- which changes are allowed to happen at all.

CREATE OR REPLACE FUNCTION invoice_fiscal_lock() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."afipCae" IS NOT NULL THEN
      RAISE EXCEPTION 'invoice % has a CAE and cannot be deleted - issue a CreditNote instead', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- OLD already had a CAE: this UPDATE is touching an issued invoice, so
  -- only balanceDue/status may actually differ.
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
      RAISE EXCEPTION 'invoice % is fiscally locked (CAE already issued) - only balanceDue/status may change; corrections need a CreditNote', OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_fiscal_lock
  BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoice_fiscal_lock();

-- Lines of a CAE'd invoice can't be inserted, changed, or removed either -
-- that would silently change totals the fiscal document already committed
-- to. Fine at INSERT time during normal creation, since the invoice's own
-- afipCae is still NULL when its lines are first created (the CAE is
-- requested and saved in a separate update afterward).
CREATE OR REPLACE FUNCTION invoice_line_fiscal_lock() RETURNS TRIGGER AS $$
DECLARE
  v_invoice_id text;
  v_cae text;
BEGIN
  v_invoice_id := COALESCE(NEW."invoiceId", OLD."invoiceId");
  SELECT "afipCae" INTO v_cae FROM invoices WHERE id = v_invoice_id;

  IF v_cae IS NOT NULL THEN
    RAISE EXCEPTION 'invoice % is fiscally locked (CAE already issued) - its lines cannot change; corrections need a CreditNote', v_invoice_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_line_fiscal_lock
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION invoice_line_fiscal_lock();

-- CreditNote is itself a fiscal document once it has a CAE - same lock,
-- simpler (it has no child lines table in this schema).
CREATE OR REPLACE FUNCTION credit_note_fiscal_lock() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."afipCae" IS NOT NULL THEN
      RAISE EXCEPTION 'credit note % has a CAE and cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- Credit notes have nothing like an invoice's balanceDue/status that
  -- legitimately changes post-issuance, so once CAE is set the row is
  -- fully frozen, not just partially.
  IF OLD."afipCae" IS NOT NULL THEN
    RAISE EXCEPTION 'credit note % is fiscally locked (CAE already issued)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_note_fiscal_lock
  BEFORE UPDATE OR DELETE ON "credit_notes"
  FOR EACH ROW EXECUTE FUNCTION credit_note_fiscal_lock();
