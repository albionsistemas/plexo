import { api } from '@/lib/api';
import type { PurchaseInvoiceStatus } from '@/lib/purchases';

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

export interface SupplierStatement {
  supplierId: string;
  supplierName: string;
  totalOutstanding: string;
  invoices: {
    id: string;
    supplierInvoiceNumber: string;
    total: string;
    balanceDue: string;
    dueDate: string | null;
    status: PurchaseInvoiceStatus;
  }[];
}

export const payablesApi = {
  getAgingReport: () => api.get<SupplierAging[]>('/payables/aging').then((r) => r.data),
  listSupplierBalances: () => api.get<SupplierBalance[]>('/payables/balances').then((r) => r.data),
  getSupplierStatement: (supplierId: string) =>
    api.get<SupplierStatement>(`/payables/suppliers/${supplierId}/statement`).then((r) => r.data),
};
