import { api } from '@/lib/api';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
export type JournalLineDirection = 'DEBIT' | 'CREDIT';

export interface AccountingAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitTotal: string;
  creditTotal: string;
  balance: string;
}

export interface JournalEntryLine {
  id: string;
  accountId: string;
  direction: JournalLineDirection;
  amount: string;
}

export interface JournalEntry {
  id: string;
  description: string;
  date: string;
  invoiceId: string | null;
  reversalOfId: string | null;
  lines: JournalEntryLine[];
}

export interface LedgerLine {
  id: string;
  direction: JournalLineDirection;
  amount: string;
  journalEntry: { id: string; description: string; date: string };
}

export interface AccountLedger {
  accountId: string;
  code: string;
  name: string;
  lines: LedgerLine[];
}

export interface CreateAccountInput {
  code: string;
  name: string;
  type: AccountType;
}

export interface PostJournalEntryLineInput {
  accountId: string;
  direction: JournalLineDirection;
  amount: number;
}

export interface PostJournalEntryInput {
  description: string;
  date?: string;
  lines: PostJournalEntryLineInput[];
}

export const accountingApi = {
  listAccounts: () => api.get<AccountingAccount[]>('/accounting/accounts').then((r) => r.data),
  createAccount: (dto: CreateAccountInput) =>
    api.post<AccountingAccount>('/accounting/accounts', dto).then((r) => r.data),
  getTrialBalance: () =>
    api.get<TrialBalanceRow[]>('/accounting/trial-balance').then((r) => r.data),
  listJournalEntries: () =>
    api.get<JournalEntry[]>('/accounting/journal-entries').then((r) => r.data),
  postJournalEntry: (dto: PostJournalEntryInput) =>
    api.post<JournalEntry>('/accounting/journal-entries', dto).then((r) => r.data),
  getAccountLedger: (accountId: string) =>
    api.get<AccountLedger>(`/accounting/accounts/${accountId}/ledger`).then((r) => r.data),
};
