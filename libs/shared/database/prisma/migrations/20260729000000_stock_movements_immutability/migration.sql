-- stock_movements is the inventory kardex: append-only by convention in
-- InventoryService (recordMovement only ever INSERTs), but until now that
-- was a code-level guarantee only. Same gap audit_log and journal_entries
-- used to have before their own lock triggers (see
-- 20260723000002_audit_log_immutability, 20260723000004_journal_entry_lock)
-- - a direct SQL UPDATE/DELETE (migration, admin script, future bug) could
-- silently rewrite history with no error. This closes that gap the same
-- way: a trigger blocks it at the row level regardless of who's connected,
-- which RLS/table grants alone don't guarantee (RLS doesn't stop the table
-- owner; a trigger does, short of an explicit ALTER TABLE ... DISABLE
-- TRIGGER, which is a loud DDL change of its own).
CREATE OR REPLACE FUNCTION stock_movements_lock() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'stock_movements rows are immutable: % is not allowed, insert a reversing/adjustment movement instead', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stock_movements_lock
  BEFORE UPDATE OR DELETE ON "stock_movements"
  FOR EACH ROW EXECUTE FUNCTION stock_movements_lock();

-- Belt and suspenders on the balance side: recordMovement() already
-- guarantees this atomically via `UPDATE ... WHERE quantity >= $delta`
-- (see inventory.service.ts) before any negative delta is applied, but
-- that's an application-level guarantee. A CHECK constraint makes "stock
-- can't go negative" true even against a direct SQL UPDATE that bypasses
-- the service entirely - the same defense-in-depth reasoning as the
-- trigger above.
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_quantity_non_negative" CHECK ("quantity" >= 0);
