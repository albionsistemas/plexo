import { Injectable } from '@nestjs/common';
import { getTenantDb, isDebitNormal, Prisma, type AccountType } from '@plexo/database';

export interface IncomeStatementLine {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  amount: Prisma.Decimal;
}

export interface IncomeStatement {
  from: Date;
  to: Date;
  lines: IncomeStatementLine[];
  totalRevenue: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  netIncome: Prisma.Decimal;
}

export interface RevenueSummary {
  from: Date;
  to: Date;
  invoiceCount: number;
  subtotal: Prisma.Decimal;
  taxTotal: Prisma.Decimal;
  total: Prisma.Decimal;
}

function defaultRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const rangeTo = to ?? new Date();
  // A "to" of just a calendar day (the common case from a date-picker,
  // e.g. "2026-07-21") parses to that day's UTC midnight - without this,
  // every invoice issued later that same day would silently fall outside
  // an "up to today" range.
  rangeTo.setUTCHours(23, 59, 59, 999);
  const rangeFrom = from ?? new Date(Date.UTC(rangeTo.getUTCFullYear(), rangeTo.getUTCMonth(), 1));
  return { from: rangeFrom, to: rangeTo };
}

@Injectable()
export class ReportsPnlService {
  /**
   * The textbook-correct income statement: INCOME/EXPENSE account
   * balances for the period, from the general ledger. Honest caveat:
   * nothing in this codebase auto-posts a JournalEntry when an invoice is
   * issued yet (that integration doesn't exist), so until someone posts
   * entries - manually via AccountingService, or a future Sales->GL
   * integration - this comes back empty. getRevenueSummary() below is the
   * fallback that works today, straight from Invoice data.
   */
  async getIncomeStatement(from?: Date, to?: Date): Promise<IncomeStatement> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const accounts = await db.accountingAccount.findMany({
      where: { type: { in: ['INCOME', 'EXPENSE'] } },
      orderBy: { code: 'asc' },
    });

    const grouped = await db.journalEntryLine.groupBy({
      by: ['accountId', 'direction'],
      where: {
        accountId: { in: accounts.map((a) => a.id) },
        journalEntry: { date: { gte: range.from, lte: range.to } },
      },
      _sum: { amount: true },
    });

    const totalsByAccount = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const row of grouped) {
      const entry = totalsByAccount.get(row.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.direction === 'DEBIT') {
        entry.debit = entry.debit.add(sum);
      } else {
        entry.credit = entry.credit.add(sum);
      }
      totalsByAccount.set(row.accountId, entry);
    }

    let totalRevenue = new Prisma.Decimal(0);
    let totalExpenses = new Prisma.Decimal(0);
    const lines: IncomeStatementLine[] = accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const amount = isDebitNormal(account.type)
        ? totals.debit.sub(totals.credit)
        : totals.credit.sub(totals.debit);

      if (account.type === 'INCOME') {
        totalRevenue = totalRevenue.add(amount);
      } else {
        totalExpenses = totalExpenses.add(amount);
      }

      return { accountId: account.id, code: account.code, name: account.name, type: account.type, amount };
    });

    return {
      from: range.from,
      to: range.to,
      lines,
      totalRevenue,
      totalExpenses,
      netIncome: totalRevenue.sub(totalExpenses),
    };
  }

  /**
   * Works today without any GL posting: revenue straight from issued
   * invoices. Not a substitute for a real income statement (no expense
   * side, no COGS - ArticleVariant/PriceHistory don't track cost anywhere
   * populated yet, so a true margin isn't computable from this alone),
   * but it's real, current data rather than an empty ledger.
   */
  async getRevenueSummary(from?: Date, to?: Date): Promise<RevenueSummary> {
    const range = defaultRange(from, to);
    const result = await getTenantDb().invoice.aggregate({
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      _sum: { subtotal: true, taxTotal: true, total: true },
      _count: true,
    });

    return {
      from: range.from,
      to: range.to,
      invoiceCount: result._count,
      subtotal: result._sum.subtotal ?? new Prisma.Decimal(0),
      taxTotal: result._sum.taxTotal ?? new Prisma.Decimal(0),
      total: result._sum.total ?? new Prisma.Decimal(0),
    };
  }
}
