export * from './lib/prisma.service.js';
export * from './lib/tenant-context.js';
export * from './lib/tenant-context.interceptor.js';
export * from './lib/database.module.js';

// Prisma namespace as a real value (not type-only): Prisma.Decimal, Prisma.sql
// etc. are legitimate runtime utilities business code needs. PrismaClient
// itself is deliberately NOT re-exported here - go through PrismaService /
// getTenantDb() instead, see prisma.service.ts.
export { Prisma } from './generated/client.js';
export type {
  Tenant,
  User,
  UserModuleAccess,
  Customer,
  Currency,
  ExchangeRateHistory,
  Category,
  Article,
  ArticleVariant,
  PriceHistory,
  Warehouse,
  StockLedger,
  MinimumStock,
  StockMovement,
  Invoice,
  InvoiceLine,
  CreditNote,
  Quote,
  QuoteLine,
  Receipt,
  AccountingAccount,
  JournalEntry,
  JournalEntryLine,
  TaxDefinition,
  FinancialAccount,
  FinancialTransaction,
  AuditLog,
} from './generated/client.js';
export * from './generated/enums.js';
