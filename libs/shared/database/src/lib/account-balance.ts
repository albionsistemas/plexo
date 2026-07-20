import type { AccountType } from '../generated/enums.js';

// Accounts with a normal debit balance; everything else is normal-credit.
// Shared because more than one module needs to net debitTotal/creditTotal
// into a single balance the same way (AccountingService's trial balance,
// reports-pnl's income statement) without importing each other's service
// classes across the scope:accounting/scope:reports-pnl boundary.
const DEBIT_NORMAL_TYPES = new Set<AccountType>(['ASSET', 'EXPENSE']);

export function isDebitNormal(type: AccountType): boolean {
  return DEBIT_NORMAL_TYPES.has(type);
}
