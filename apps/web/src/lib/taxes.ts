import { api } from '@/lib/api';

export type TaxCalculationType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FORMULA' | 'EXENTO' | 'NO_GRAVADO';

export interface TaxDefinition {
  id: string;
  code: string;
  name: string;
  calculationType: TaxCalculationType;
  rate: string | null;
  fixedAmount: string | null;
  formula: string | null;
  validFrom: string;
  validTo: string | null;
  managedByAccountant: boolean;
}

export interface CreateTaxDefinitionInput {
  code: string;
  name: string;
  calculationType?: TaxCalculationType;
  rate?: number;
  fixedAmount?: number;
  formula?: string;
  managedByAccountant?: boolean;
}

export interface ReviseTaxDefinitionInput {
  code: string;
  rate?: number;
  fixedAmount?: number;
  effectiveFrom?: string;
}

export const taxesApi = {
  listTaxDefinitions: () => api.get<TaxDefinition[]>('/taxes/definitions').then((r) => r.data),
  createTaxDefinition: (dto: CreateTaxDefinitionInput) =>
    api.post<TaxDefinition>('/taxes/definitions', dto).then((r) => r.data),
  reviseTaxDefinition: (dto: ReviseTaxDefinitionInput) =>
    api.post<TaxDefinition>('/taxes/definitions/revise', dto).then((r) => r.data),
  getTaxDefinitionHistory: (code: string) =>
    api.get<TaxDefinition[]>(`/taxes/definitions/${code}/history`).then((r) => r.data),
};

// --- Retenciones a proveedores (Ganancias/IVA/IIBB) ---

export type WithholdingTaxType = 'INCOME_TAX' | 'VAT' | 'GROSS_INCOME';

export const WITHHOLDING_TAX_TYPE_LABELS: Record<WithholdingTaxType, string> = {
  INCOME_TAX: 'Ganancias',
  VAT: 'IVA',
  GROSS_INCOME: 'IIBB',
};

// Las 24 jurisdicciones fiscales argentinas (CABA + 23 provincias) - sólo
// tiene sentido cuando taxType = GROSS_INCOME, ver el comentario del
// modelo WithholdingRegime en el backend.
export type ArgentineJurisdiction =
  | 'CABA'
  | 'BUENOS_AIRES'
  | 'CATAMARCA'
  | 'CHACO'
  | 'CHUBUT'
  | 'CORDOBA'
  | 'CORRIENTES'
  | 'ENTRE_RIOS'
  | 'FORMOSA'
  | 'JUJUY'
  | 'LA_PAMPA'
  | 'LA_RIOJA'
  | 'MENDOZA'
  | 'MISIONES'
  | 'NEUQUEN'
  | 'RIO_NEGRO'
  | 'SALTA'
  | 'SAN_JUAN'
  | 'SAN_LUIS'
  | 'SANTA_CRUZ'
  | 'SANTA_FE'
  | 'SANTIAGO_DEL_ESTERO'
  | 'TIERRA_DEL_FUEGO'
  | 'TUCUMAN';

export const ARGENTINE_JURISDICTION_LABELS: Record<ArgentineJurisdiction, string> = {
  CABA: 'CABA',
  BUENOS_AIRES: 'Buenos Aires',
  CATAMARCA: 'Catamarca',
  CHACO: 'Chaco',
  CHUBUT: 'Chubut',
  CORDOBA: 'Córdoba',
  CORRIENTES: 'Corrientes',
  ENTRE_RIOS: 'Entre Ríos',
  FORMOSA: 'Formosa',
  JUJUY: 'Jujuy',
  LA_PAMPA: 'La Pampa',
  LA_RIOJA: 'La Rioja',
  MENDOZA: 'Mendoza',
  MISIONES: 'Misiones',
  NEUQUEN: 'Neuquén',
  RIO_NEGRO: 'Río Negro',
  SALTA: 'Salta',
  SAN_JUAN: 'San Juan',
  SAN_LUIS: 'San Luis',
  SANTA_CRUZ: 'Santa Cruz',
  SANTA_FE: 'Santa Fe',
  SANTIAGO_DEL_ESTERO: 'Santiago del Estero',
  TIERRA_DEL_FUEGO: 'Tierra del Fuego',
  TUCUMAN: 'Tucumán',
};

export interface WithholdingRegime {
  id: string;
  code: string;
  name: string;
  taxType: WithholdingTaxType;
  jurisdiction: ArgentineJurisdiction | null;
  rate: string;
  minTaxableAmount: string;
  validFrom: string;
  validTo: string | null;
  managedByAccountant: boolean;
}

export interface CreateWithholdingRegimeInput {
  code: string;
  name: string;
  taxType: WithholdingTaxType;
  jurisdiction?: ArgentineJurisdiction;
  rate: number;
  minTaxableAmount?: number;
  managedByAccountant?: boolean;
}

export interface ReviseWithholdingRegimeInput {
  code: string;
  rate?: number;
  jurisdiction?: ArgentineJurisdiction;
  minTaxableAmount?: number;
  effectiveFrom?: string;
}

export const withholdingRegimesApi = {
  list: () => api.get<WithholdingRegime[]>('/taxes/withholding-regimes').then((r) => r.data),
  listActive: (taxType?: WithholdingTaxType) =>
    api
      .get<WithholdingRegime[]>('/taxes/withholding-regimes/active', { params: { taxType } })
      .then((r) => r.data),
  create: (dto: CreateWithholdingRegimeInput) =>
    api.post<WithholdingRegime>('/taxes/withholding-regimes', dto).then((r) => r.data),
  revise: (dto: ReviseWithholdingRegimeInput) =>
    api.post<WithholdingRegime>('/taxes/withholding-regimes/revise', dto).then((r) => r.data),
  getHistory: (code: string) =>
    api.get<WithholdingRegime[]>(`/taxes/withholding-regimes/${code}/history`).then((r) => r.data),
};

// --- Libro IVA Ventas / Compras ---

export interface VatBookEntry {
  id: string;
  date: string;
  documentType: string;
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

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function openPdfBlob(path: string, params: { from: string; to: string }) {
  const res = await api.get(path, { params, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export const vatBookApi = {
  getSales: (params: { from: string; to: string }) =>
    api.get<VatBookResult>('/taxes/vat-book/sales', { params }).then((r) => r.data),
  getPurchases: (params: { from: string; to: string }) =>
    api.get<VatBookResult>('/taxes/vat-book/purchases', { params }).then((r) => r.data),
  downloadSalesExcel: async (params: { from: string; to: string }) => {
    const res = await api.get('/taxes/vat-book/sales/excel', { params, responseType: 'blob' });
    downloadBlob(new Blob([res.data]), `libro-iva-ventas_${params.from}_${params.to}.xlsx`);
  },
  downloadPurchasesExcel: async (params: { from: string; to: string }) => {
    const res = await api.get('/taxes/vat-book/purchases/excel', { params, responseType: 'blob' });
    downloadBlob(new Blob([res.data]), `libro-iva-compras_${params.from}_${params.to}.xlsx`);
  },
  openSalesPdf: (params: { from: string; to: string }) => openPdfBlob('/taxes/vat-book/sales/pdf', params),
  openPurchasesPdf: (params: { from: string; to: string }) => openPdfBlob('/taxes/vat-book/purchases/pdf', params),

  // --- Libro de IVA Digital (RG 4597 / ARCA) ---
  downloadVentasCbteCiti: async (params: { from: string; to: string }) => {
    const res = await api.get('/taxes/vat-book/sales/citi/cbte', { params, responseType: 'blob' });
    downloadBlob(new Blob([res.data]), 'LIBRO_IVA_DIGITAL_VENTAS_CBTE.txt');
  },
  downloadVentasAlicuotasCiti: async (params: { from: string; to: string }) => {
    const res = await api.get('/taxes/vat-book/sales/citi/alicuotas', { params, responseType: 'blob' });
    downloadBlob(new Blob([res.data]), 'LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS.txt');
  },
  // Compras devuelve la cantidad de comprobantes excluidos (sin Tipo de
  // comprobante/Punto de Venta/Número cargados) en el header
  // X-Skipped-Count, para que la UI avise en vez de fallar en silencio.
  downloadComprasCbteCiti: async (params: { from: string; to: string }): Promise<number> => {
    const res = await api.get('/taxes/vat-book/purchases/citi/cbte', { params, responseType: 'blob' });
    downloadBlob(new Blob([res.data]), 'LIBRO_IVA_DIGITAL_COMPRAS_CBTE.txt');
    return Number(res.headers['x-skipped-count'] ?? 0);
  },
  downloadComprasAlicuotasCiti: async (params: { from: string; to: string }): Promise<number> => {
    const res = await api.get('/taxes/vat-book/purchases/citi/alicuotas', { params, responseType: 'blob' });
    downloadBlob(new Blob([res.data]), 'LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS.txt');
    return Number(res.headers['x-skipped-count'] ?? 0);
  },
};
