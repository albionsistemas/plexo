import { api } from '@/lib/api';

export interface CustomerAging {
  customerId: string;
  customerName: string;
  current: string;
  days1to30: string;
  days31to60: string;
  days61to90: string;
  days90Plus: string;
  totalOutstanding: string;
}

export interface CustomerBalance {
  customerId: string;
  customerName: string;
  creditLimit: string;
  outstanding: string;
  availableCredit: string;
}

export type StatementEntryType = 'INVOICE' | 'CREDIT_NOTE' | 'RECEIPT';

export interface CustomerStatementEntry {
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

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  creditLimit: string;
  totalOutstanding: string;
  totalOverdue: string;
  totalNotYetDue: string;
  entries: CustomerStatementEntry[];
}

export interface GetCustomerStatementParams {
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

function statementParams(params?: GetCustomerStatementParams) {
  return {
    ...(params?.from ? { from: params.from } : {}),
    ...(params?.to ? { to: params.to } : {}),
    ...(params?.pendingOnly ? { pendingOnly: 'true' } : {}),
  };
}

export const receivablesApi = {
  getAgingReport: () => api.get<CustomerAging[]>('/receivables/aging').then((r) => r.data),
  listCustomerBalances: () =>
    api.get<CustomerBalance[]>('/receivables/balances').then((r) => r.data),
  getCustomerStatement: (customerId: string, params?: GetCustomerStatementParams) =>
    api
      .get<CustomerStatement>(`/receivables/customers/${customerId}/statement`, { params: statementParams(params) })
      .then((r) => r.data),
  openCustomerStatementPdf: async (customerId: string, params?: GetCustomerStatementParams) => {
    const res = await api.get(`/receivables/customers/${customerId}/statement/pdf`, {
      params: statementParams(params),
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
  },
  downloadCustomerStatementExcel: async (
    customerId: string,
    customerName: string,
    params?: GetCustomerStatementParams,
  ) => {
    const res = await api.get(`/receivables/customers/${customerId}/statement/excel`, {
      params: statementParams(params),
      responseType: 'blob',
    });
    const slug = customerName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    downloadBlob(new Blob([res.data]), `cuenta-corriente_${slug}.xlsx`);
  },
  refreshOverdueStatuses: () =>
    api.post<{ updated: number }>('/receivables/overdue/refresh').then((r) => r.data),
};
