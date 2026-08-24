import { api } from '@/lib/api';

export interface SupplierAging {
  supplierId: string;
  supplierName: string;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  days90Plus: string;
  totalOutstanding: string;
}

export interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  outstanding: string;
}

export type StatementEntryType = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT';

export interface SupplierStatementEntry {
  id: string;
  date: string;
  type: StatementEntryType;
  documentNumber: string;
  dueDate: string | null;
  debe: string;
  haber: string;
  balance: string;
  status: string | null;
  pendingBalance: string | null;
}

export interface SupplierStatement {
  supplierId: string;
  supplierName: string;
  totalOutstanding: string;
  totalOverdue: string;
  totalNotYetDue: string;
  entries: SupplierStatementEntry[];
}

export interface GetSupplierStatementParams {
  from?: string;
  to?: string;
  pendingOnly?: boolean;
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

function statementParams(params?: GetSupplierStatementParams) {
  return {
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
    ...(params?.pendingOnly ? { pendingOnly: 'true' } : {}),
  };
}

export const payablesApi = {
  getAgingReport: () => api.get<SupplierAging[]>('/payables/aging').then((r) => r.data),
  listSupplierBalances: () => api.get<SupplierBalance[]>('/payables/balances').then((r) => r.data),
  getSupplierStatement: (supplierId: string, params?: GetSupplierStatementParams) =>
    api
      .get<SupplierStatement>(`/payables/suppliers/${supplierId}/statement`, { params: statementParams(params) })
      .then((r) => r.data),
  openSupplierStatementPdf: async (supplierId: string, params?: GetSupplierStatementParams) => {
    const res = await api.get(`/payables/suppliers/${supplierId}/statement/pdf`, {
      params: statementParams(params),
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
  },
  downloadSupplierStatementExcel: async (
    supplierId: string,
    supplierName: string,
    params?: GetSupplierStatementParams,
  ) => {
    const res = await api.get(`/payables/suppliers/${supplierId}/statement/excel`, {
      params: statementParams(params),
      responseType: 'blob',
    });
    const slug = supplierName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    downloadBlob(new Blob([res.data]), `cuenta-corriente_${slug}.xlsx`);
  },
};
