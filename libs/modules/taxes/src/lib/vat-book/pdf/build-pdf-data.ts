import type { VatBookEntry, VatBookResult } from '../vat-book.types.js';
import type { VatBookPdfData } from './vat-book-pdf-data.js';

function formatNumber(value: number): string {
  return value.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberLabel(entry: VatBookEntry): string {
  if (entry.pointOfSale) return `${entry.pointOfSale}-${entry.number}`;
  return entry.number;
}

export function buildVatBookPdfData(
  result: VatBookResult,
  tenant: { name: string; taxId: string | null },
): VatBookPdfData {
  return {
    tenantName: tenant.name,
    tenantTaxId: tenant.taxId,
    title: result.kind === 'sales' ? 'Libro IVA Ventas' : 'Libro IVA Compras',
    kind: result.kind,
    from: result.from,
    to: result.to,
    generatedAt: new Date().toLocaleDateString('es-AR'),
    lines: result.entries.map((entry) => ({
      date: entry.date,
      documentType: entry.documentType,
      numberLabel: numberLabel(entry),
      counterpartyName: entry.counterpartyName,
      counterpartyTaxId: entry.counterpartyTaxId ?? `(${entry.counterpartyDocType})`,
      taxCondition: entry.taxCondition ?? '—',
      netTaxed: formatNumber(entry.netTaxed),
      netExempt: formatNumber(entry.netExempt),
      netUntaxed: formatNumber(entry.netUntaxed),
      vat21: formatNumber(entry.vat21),
      vat10_5: formatNumber(entry.vat10_5),
      vat27: formatNumber(entry.vat27),
      vatOther: formatNumber(entry.vatOther),
      perceptions: formatNumber(entry.perceptions),
      vatTotal: formatNumber(entry.vatTotal),
      total: formatNumber(entry.total),
    })),
    totals: {
      netTaxed: formatNumber(result.totals.netTaxed),
      netExempt: formatNumber(result.totals.netExempt),
      netUntaxed: formatNumber(result.totals.netUntaxed),
      vat21: formatNumber(result.totals.vat21),
      vat10_5: formatNumber(result.totals.vat10_5),
      vat27: formatNumber(result.totals.vat27),
      vatOther: formatNumber(result.totals.vatOther),
      perceptions: formatNumber(result.totals.perceptions),
      vatTotal: formatNumber(result.totals.vatTotal),
      total: formatNumber(result.totals.total),
    },
  };
}
