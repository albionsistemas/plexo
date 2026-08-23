export interface VatBookPdfLine {
  date: string;
  documentType: string;
  numberLabel: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  taxCondition: string;
  netTaxed: string;
  netExempt: string;
  netUntaxed: string;
  vat21: string;
  vat10_5: string;
  vat27: string;
  vatOther: string;
  perceptions: string;
  vatTotal: string;
  total: string;
}

export interface VatBookPdfTotals {
  netTaxed: string;
  netExempt: string;
  netUntaxed: string;
  vat21: string;
  vat10_5: string;
  vat27: string;
  vatOther: string;
  perceptions: string;
  vatTotal: string;
  total: string;
}

export interface VatBookPdfData {
  tenantName: string;
  tenantTaxId: string | null;
  title: string;
  // Ventas muestra 3 columnas de alícuota + "Otras" - Compras no tiene
  // desglose real (ver VatBookService), así que el template colapsa esas
  // 4 columnas en una sola "IVA Crédito Fiscal" cuando kind=purchases.
  kind: 'sales' | 'purchases';
  from: string;
  to: string;
  generatedAt: string;
  lines: VatBookPdfLine[];
  totals: VatBookPdfTotals;
}
