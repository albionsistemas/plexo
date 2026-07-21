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

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  creditLimit: string;
  totalOutstanding: string;
  invoices: {
    id: string;
    number: string;
    documentLetter: string;
    total: string;
    balanceDue: string;
    dueDate: string | null;
    status: string;
  }[];
}

export const receivablesApi = {
  getAgingReport: () => api.get<CustomerAging[]>('/receivables/aging').then((r) => r.data),
  listCustomerBalances: () =>
    api.get<CustomerBalance[]>('/receivables/balances').then((r) => r.data),
  getCustomerStatement: (customerId: string) =>
    api.get<CustomerStatement>(`/receivables/customers/${customerId}/statement`).then((r) => r.data),
  refreshOverdueStatuses: () =>
    api.post<{ updated: number }>('/receivables/overdue/refresh').then((r) => r.data),
};
