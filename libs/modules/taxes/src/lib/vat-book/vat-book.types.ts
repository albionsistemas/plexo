/** Una fila del libro (una Factura, o una Nota de Crédito con todos sus
 * importes en negativo - así una sumatoria simple sobre `entries` neta
 * correctamente sin lógica de signos aparte en el llamador). */
export interface VatBookEntry {
  id: string;
  date: string;
  documentType: string;
  // Compras no tiene letra/punto de venta propios en el modelo (es el
  // comprobante del proveedor, identificado por su propio número/fecha
  // libres) - null en ese caso, ver VatBookService.
  documentLetter: string | null;
  pointOfSale: string | null;
  number: string;
  counterpartyName: string;
  counterpartyTaxId: string | null;
  counterpartyDocType: 'CUIT' | 'CF';
  taxCondition: string | null;
  currencyCode: string;
  netTaxed: number;
  netExempt: number;
  netUntaxed: number;
  // Ventas: desglosado por alícuota real de cada línea. Compras: el
  // modelo no guarda alícuota por línea (ver PurchaseInvoiceTaxLine, sólo
  // IVA_CREDITO/PERCEPCION con concepto libre) - todo el IVA crédito cae
  // en vatOther, vat21/vat10_5/vat27 quedan en 0. El frontend elige qué
  // columnas mostrar según la pestaña.
  vat21: number;
  vat10_5: number;
  vat27: number;
  vatOther: number;
  perceptions: number;
  vatTotal: number;
  total: number;
  isCreditNote: boolean;
}

export interface VatBookTotals {
  netTaxed: number;
  netExempt: number;
  netUntaxed: number;
  vat21: number;
  vat10_5: number;
  vat27: number;
  vatOther: number;
  perceptions: number;
  vatTotal: number;
  total: number;
}

export interface VatBookResult {
  kind: 'sales' | 'purchases';
  from: string;
  to: string;
  entries: VatBookEntry[];
  totals: VatBookTotals;
}

const NUMERIC_TOTAL_FIELDS = [
  'netTaxed',
  'netExempt',
  'netUntaxed',
  'vat21',
  'vat10_5',
  'vat27',
  'vatOther',
  'perceptions',
  'vatTotal',
  'total',
] as const;

export function sumTotals(entries: VatBookEntry[]): VatBookTotals {
  const totals: VatBookTotals = {
    netTaxed: 0,
    netExempt: 0,
    netUntaxed: 0,
    vat21: 0,
    vat10_5: 0,
    vat27: 0,
    vatOther: 0,
    perceptions: 0,
    vatTotal: 0,
    total: 0,
  };
  for (const entry of entries) {
    for (const field of NUMERIC_TOTAL_FIELDS) {
      totals[field] += entry[field];
    }
  }
  // Redondeo a centavos recién al sumar todo - los importes por fila ya
  // vienen de Decimals de Prisma convertidos a number, sumarlos en punto
  // flotante puede arrastrar residuos de milésimas.
  for (const field of NUMERIC_TOTAL_FIELDS) {
    totals[field] = Math.round(totals[field] * 100) / 100;
  }
  return totals;
}
