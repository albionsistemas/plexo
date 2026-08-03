import type { QuotePdfData, QuotePdfLine } from './pdf-data.js';

interface PdfSourceLine {
  quantity: { toString(): string };
  unitPrice: { toString(): string };
  articleVariant: { sku: string; article: { name: string } };
}

interface PdfSourceQuote {
  number: string;
  createdAt: Date;
  validUntil: Date | null;
  notes: string | null;
  total: { toString(): string };
  currency: { code: string };
  customer: { name: string; taxId: string | null; fiscalAddress: string | null };
  lines: PdfSourceLine[];
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' });

export function buildQuotePdfData(
  quote: PdfSourceQuote,
  tenant: { name: string; taxId: string | null },
): QuotePdfData {
  const lines: QuotePdfLine[] = quote.lines.map((line) => {
    const quantity = Number(line.quantity.toString());
    const unitPrice = Number(line.unitPrice.toString());
    return {
      articleName: line.articleVariant.article.name,
      sku: line.articleVariant.sku,
      quantity: formatNumber(quantity),
      unitPrice: formatNumber(unitPrice),
      lineTotal: formatNumber(quantity * unitPrice),
    };
  });

  return {
    number: quote.number,
    issueDate: dateFormatter.format(quote.createdAt),
    validUntil: quote.validUntil ? dateFormatter.format(quote.validUntil) : null,
    tenantName: tenant.name,
    tenantTaxId: tenant.taxId,
    customerName: quote.customer.name,
    customerTaxId: quote.customer.taxId,
    customerAddress: quote.customer.fiscalAddress,
    currencyCode: quote.currency.code,
    lines,
    total: formatNumber(Number(quote.total.toString())),
    notes: quote.notes,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
