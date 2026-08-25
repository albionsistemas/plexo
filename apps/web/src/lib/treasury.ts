import { api } from '@/lib/api';

export type CheckKind = 'THIRD_PARTY' | 'OWN';
export type CheckFormat = 'PHYSICAL' | 'ECHEQ';
export type CheckStatus = 'PORTFOLIO' | 'DEPOSITED' | 'ENDORSED' | 'CLEARED' | 'REJECTED' | 'ISSUED' | 'VOIDED';

// Espeja Check tal cual lo devuelve la API (sin includes - CheckService no
// importa @plexo/companies/@plexo/reports-financial, ver treasury.service.ts
// en el backend) - customerId/supplierId/financialAccountId se resuelven a
// nombre acá mismo, cruzando contra companiesApi/reportsApi.
export interface Check {
  id: string;
  kind: CheckKind;
  format: CheckFormat;
  number: string;
  bankName: string;
  drawerCuit: string | null;
  amount: string;
  issueDate: string;
  dueDate: string;
  status: CheckStatus;
  customerId: string | null;
  supplierId: string | null;
  receiptId: string | null;
  supplierPaymentId: string | null;
  financialAccountId: string | null;
  rejectionReason: string | null;
  rejectionFeeAmount: string | null;
  rejectedAt: string | null;
  createdByUserId: string;
  createdAt: string;
}

export interface ListChecksFilters {
  status?: CheckStatus;
  kind?: CheckKind;
  bankName?: string;
  dueFrom?: string;
  dueTo?: string;
}

export interface RejectCheckInput {
  reason: string;
  feeAmount?: number;
}

export const CHECK_KIND_LABELS: Record<CheckKind, string> = {
  THIRD_PARTY: 'De tercero',
  OWN: 'Propio',
};

const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  PORTFOLIO: 'En cartera',
  DEPOSITED: 'Depositado',
  ENDORSED: 'Endosado',
  CLEARED: 'Acreditado',
  REJECTED: 'Rechazado',
  ISSUED: 'Emitido',
  VOIDED: 'Anulado',
};

const CHECK_STATUS_COLORS: Record<CheckStatus, string> = {
  PORTFOLIO: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  DEPOSITED: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300',
  ENDORSED: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  CLEARED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  REJECTED: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  ISSUED: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  VOIDED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

export function describeCheckStatus(status: CheckStatus): { label: string; colorClass: string } {
  return { label: CHECK_STATUS_LABELS[status], colorClass: CHECK_STATUS_COLORS[status] };
}

export const treasuryApi = {
  listChecks: (filters: ListChecksFilters = {}) =>
    api.get<Check[]>('/treasury/checks', { params: filters }).then((r) => r.data),
  getCheck: (id: string) => api.get<Check>(`/treasury/checks/${id}`).then((r) => r.data),
  depositCheck: (id: string, financialAccountId: string) =>
    api.post<Check>(`/treasury/checks/${id}/deposit`, { financialAccountId }).then((r) => r.data),
  markCleared: (id: string) => api.post<Check>(`/treasury/checks/${id}/clear`).then((r) => r.data),
  rejectCheck: (id: string, dto: RejectCheckInput) =>
    api.post<Check>(`/treasury/checks/${id}/reject`, dto).then((r) => r.data),
};
