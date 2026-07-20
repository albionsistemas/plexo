import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReportsPnlService } from './reports-pnl.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ReportsPnlService.getIncomeStatement', () => {
  it('nets INCOME/EXPENSE accounts and rolls them into totalRevenue/totalExpenses/netIncome', async () => {
    const db = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'acc-sales', code: '4000', name: 'Sales', type: 'INCOME' },
          { id: 'acc-cogs', code: '5000', name: 'COGS', type: 'EXPENSE' },
        ]),
      },
      journalEntryLine: {
        groupBy: jest.fn().mockResolvedValue([
          { accountId: 'acc-sales', direction: 'CREDIT', _sum: { amount: new Prisma.Decimal(1000) } },
          { accountId: 'acc-cogs', direction: 'DEBIT', _sum: { amount: new Prisma.Decimal(400) } },
        ]),
      },
    };
    const service = new ReportsPnlService();
    const from = new Date('2026-07-01');
    const to = new Date('2026-07-31');

    const statement = await runInTenant(db, () => service.getIncomeStatement(from, to));

    expect(db.journalEntryLine.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          journalEntry: { date: { gte: from, lte: to } },
        }),
      }),
    );
    expect(statement.totalRevenue.toNumber()).toBe(1000);
    expect(statement.totalExpenses.toNumber()).toBe(400);
    expect(statement.netIncome.toNumber()).toBe(600);
  });

  it('defaults an account with no postings this period to a zero line', async () => {
    const db = {
      accountingAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'acc-sales', code: '4000', name: 'Sales', type: 'INCOME' }]),
      },
      journalEntryLine: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReportsPnlService();

    const statement = await runInTenant(db, () => service.getIncomeStatement());

    expect(statement.lines[0].amount.toNumber()).toBe(0);
    expect(statement.netIncome.toNumber()).toBe(0);
  });
});

describe('ReportsPnlService.getRevenueSummary', () => {
  it('aggregates invoice totals, excluding cancelled invoices', async () => {
    const db = {
      invoice: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: {
            subtotal: new Prisma.Decimal(1000),
            taxTotal: new Prisma.Decimal(210),
            total: new Prisma.Decimal(1210),
          },
          _count: 5,
        }),
      },
    };
    const service = new ReportsPnlService();

    const summary = await runInTenant(db, () => service.getRevenueSummary());

    expect(db.invoice.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'CANCELLED' } }),
      }),
    );
    expect(summary.invoiceCount).toBe(5);
    expect(summary.total.toNumber()).toBe(1210);
  });

  it('returns zero sums when there are no invoices in range', async () => {
    const db = {
      invoice: {
        aggregate: jest
          .fn()
          .mockResolvedValue({ _sum: { subtotal: null, taxTotal: null, total: null }, _count: 0 }),
      },
    };
    const service = new ReportsPnlService();

    const summary = await runInTenant(db, () => service.getRevenueSummary());

    expect(summary.total.toNumber()).toBe(0);
    expect(summary.invoiceCount).toBe(0);
  });
});
