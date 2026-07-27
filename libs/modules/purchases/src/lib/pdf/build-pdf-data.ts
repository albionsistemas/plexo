import type { PurchaseDocumentPdfData, PurchaseDocumentPdfLine } from './pdf-data.js';

interface PdfSourceLine {
  quantity: { toString(): string };
  unitCost: { toString(): string };
  articleVariant: { sku: string; article: { name: string } };
}

interface PdfSourceDocument {
  number: string;
  createdAt: Date;
  notes: string | null;
  total: { toString(): string };
  currency: { code: string };
  supplier: { name: string; taxId: string | null; fiscalAddress: string | null };
  transportMode: { name: string } | null;
  paymentTerm: { name: string } | null;
  deliveryTime: { name: string } | null;
  lines: PdfSourceLine[];
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });

/** Both QuoteRequest and PurchaseOrder map to the same PDF data shape -
 * callers pass in the already-computed `total` (QuoteRequest.estimatedTotal
 * may be null if a line has no cost yet; PurchaseOrder.total never is) and
 * each line's cost field (estimatedUnitCost vs unitCost - different column
 * names on the two models). */
export function buildPurchaseDocumentPdfData(
  documentTypeLabel: string,
  doc: PdfSourceDocument,
  tenant: { name: string; taxId: string | null },
): PurchaseDocumentPdfData {
  const lines: PurchaseDocumentPdfLine[] = doc.lines.map((line) => {
    const quantity = Number(line.quantity.toString());
    const unitCost = Number(line.unitCost.toString());
    return {
      articleName: line.articleVariant.article.name,
      sku: line.articleVariant.sku,
      quantity: formatNumber(quantity),
      unitCost: formatNumber(unitCost),
      lineTotal: formatNumber(quantity * unitCost),
    };
  });

  return {
    documentTypeLabel,
    number: doc.number,
    issueDate: dateFormatter.format(doc.createdAt),
    tenantName: tenant.name,
    tenantTaxId: tenant.taxId,
    supplierName: doc.supplier.name,
    supplierTaxId: doc.supplier.taxId,
    supplierAddress: doc.supplier.fiscalAddress,
    transportModeName: doc.transportMode?.name ?? null,
    paymentTermName: doc.paymentTerm?.name ?? null,
    deliveryTimeName: doc.deliveryTime?.name ?? null,
    currencyCode: doc.currency.code,
    lines,
    total: formatNumber(Number(doc.total.toString())),
    notes: doc.notes,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
