/** Shared data shape all 5 templates render from, built once by
 * QuoteService.generatePdf. Customer-facing (unlike @plexo/inventory-cart's
 * single-template cart export) - full 5-style system, same as
 * @plexo/purchases, but a standalone copy: no module imports another
 * module's internals (see purchase-email-sender.port.ts for the same rule
 * applied to email senders). */
export interface QuotePdfLine {
  articleName: string;
  variantLabel: string | null;
  sku: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface QuotePdfData {
  number: string;
  issueDate: string;
  validUntil: string | null;
  tenantName: string;
  tenantTaxId: string | null;
  customerName: string;
  customerTaxId: string | null;
  customerAddress: string | null;
  currencyCode: string;
  lines: QuotePdfLine[];
  total: string;
  notes: string | null;
}
