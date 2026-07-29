/** Shared data shape all 5 templates render from - built once by
 * PdfGeneratorService from either a QuoteRequest or a PurchaseOrder, so the
 * templates themselves don't know or care which kind of document it is. */
export interface PurchaseDocumentPdfLine {
  articleName: string;
  sku: string;
  quantity: string;
  unitCost: string;
  lineTotal: string;
}

export interface PurchaseDocumentPdfData {
  documentTypeLabel: string;
  number: string;
  issueDate: string;
  tenantName: string;
  tenantTaxId: string | null;
  supplierName: string;
  supplierTaxId: string | null;
  supplierAddress: string | null;
  transportModeName: string | null;
  paymentTermName: string | null;
  deliveryTimeName: string | null;
  currencyCode: string;
  lines: PurchaseDocumentPdfLine[];
  total: string;
  notes: string | null;
}
