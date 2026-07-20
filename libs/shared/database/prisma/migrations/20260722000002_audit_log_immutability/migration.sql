-- Audit trail via Postgres triggers, not Prisma middleware/extensions.
-- Rationale (see PR/commit message for the full write-up): a Prisma-layer
-- hook only fires for writes that go through that specific client instance.
-- Anything else - a future script, a different service, a DBA at the psql
-- prompt, a bug that drops to $executeRaw - would silently bypass it. A
-- trigger fires on the actual row-level write regardless of who issued it,
-- which is the only way "audit trail" and "cannot be bypassed by admins"
-- both hold at once.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION audit_log_capture() RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id text;
  v_record_id text;
  v_changes jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_tenant_id := OLD."tenantId";
    v_record_id := OLD.id;
    v_changes := jsonb_build_object('old', to_jsonb(OLD), 'new', NULL);
  ELSIF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW."tenantId";
    v_record_id := NEW.id;
    v_changes := jsonb_build_object('old', NULL, 'new', to_jsonb(NEW));
  ELSE
    v_tenant_id := NEW."tenantId";
    v_record_id := NEW.id;
    v_changes := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  END IF;

  INSERT INTO audit_log ("id", "tenantId", "tableName", "recordId", "action", "changedBy", "changes", "createdAt")
  VALUES (
    gen_random_uuid()::text,
    v_tenant_id,
    TG_TABLE_NAME,
    v_record_id,
    TG_OP::"AuditAction",
    current_setting('app.user_id', true),
    v_changes,
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_articles
  AFTER INSERT OR UPDATE OR DELETE ON "articles"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();

CREATE TRIGGER audit_article_variants
  AFTER INSERT OR UPDATE OR DELETE ON "article_variants"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();

CREATE TRIGGER audit_minimum_stock
  AFTER INSERT OR UPDATE OR DELETE ON "minimum_stock"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();

-- "AuditLog detallado de toda la transacción" for the fiscal documents:
-- invoices, their lines, and credit notes.
CREATE TRIGGER audit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();

CREATE TRIGGER audit_invoice_lines
  AFTER INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();

CREATE TRIGGER audit_credit_notes
  AFTER INSERT OR UPDATE OR DELETE ON "credit_notes"
  FOR EACH ROW EXECUTE FUNCTION audit_log_capture();

-- Belt and suspenders on top of the REVOKE in the RLS migration: even if a
-- future migration re-grants UPDATE/DELETE on audit_log, or something
-- connects as a role that already has it, this still blocks the write.
-- Unlike RLS policies, triggers are NOT bypassed by superuser/table-owner
-- status - only an explicit `ALTER TABLE ... DISABLE TRIGGER` gets around
-- it, which is a loud, auditable DDL change of its own.
CREATE OR REPLACE FUNCTION audit_log_block_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log rows are immutable: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_mutation();
