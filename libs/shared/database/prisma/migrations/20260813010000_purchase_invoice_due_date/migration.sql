-- Optional dueDate on PurchaseInvoice, purely additive - see the schema
-- comment on PurchaseInvoice.dueDate for why it's nullable (same
-- convention as Invoice.dueDate, and PaymentTerm is still just a free-text
-- label today, not something Plexo can compute a date from).

ALTER TABLE "purchase_invoices" ADD COLUMN     "dueDate" TIMESTAMP(3);
