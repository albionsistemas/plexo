-- Journal entries are posted atomically (entry + all its lines created
-- together in one transaction, see AccountingService.postJournalEntry)
-- and have no legitimate reason to change afterward - unlike Invoice,
-- there's no balanceDue/status equivalent that needs to keep moving.
-- A correction is a reversing entry (same lines, DEBIT/CREDIT swapped),
-- never an UPDATE to the original.

CREATE OR REPLACE FUNCTION journal_entry_lock() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'journal_entries are immutable once posted - % is not allowed, post a reversing entry instead', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_lock
  BEFORE UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION journal_entry_lock();

CREATE OR REPLACE FUNCTION journal_entry_line_lock() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'journal_entry_lines are immutable once posted - % is not allowed, post a reversing entry instead', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entry_line_lock
  BEFORE UPDATE OR DELETE ON "journal_entry_lines"
  FOR EACH ROW EXECUTE FUNCTION journal_entry_line_lock();
