/** Single, standalone shape for the cart's PDF export - deliberately not
 * reusing @plexo/purchases' PurchaseDocumentPdfData/PdfGeneratorService (no
 * module imports another module's internals, see purchase-email-sender.port
 * .ts for the same rule applied elsewhere). This is an internal working-list
 * report, not a customer/supplier-facing document, so it gets one clean
 * template instead of the 5-style system Quotes/Purchases use. */
export interface CartPdfLine {
  articleName: string;
  variantLabel: string | null;
  sku: string;
  categoryName: string | null;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface CartPdfData {
  tenantName: string;
  generatedAt: string;
  requestedByName: string;
  lines: CartPdfLine[];
  total: string;
}
