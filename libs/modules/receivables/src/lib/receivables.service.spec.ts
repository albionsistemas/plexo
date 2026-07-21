import { NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReceivablesService } from './receivables.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const ASOF = new Date('2026-07-20T00:00:00.000Z');
const daysAgo = (n: number) => new Date(ASOF.getTime() - n * 24 * 60 * 60 * 1000);

describe('ReceivablesService.getAgingReport', () => {
  it('buckets each open invoice by days overdue and totals per customer', async () => {
    const invoices = [
      // customer-1: one current, one 10 days overdue
      { customerId: 'customer-1', customer: { name: 'Acme' }, balanceDue: new Prisma.Decimal(100), dueDate: daysAgo(-5) },
      { customerId: 'customer-1', customer: { name: 'Acme' }, balanceDue: new Prisma.Decimal(50), dueDate: daysAgo(10) },
      // customer-2: one 45 days overdue, one 95 days overdue, one with no due date
      { customerId: 'customer-2', customer: { name: 'Beta' }, balanceDue: new Prisma.Decimal(200), dueDate: daysAgo(45) },
      { customerId: 'customer-2', customer: { name: 'Beta' }, balanceDue: new Prisma.Decimal(300), dueDate: daysAgo(95) },
      { customerId: 'customer-2', customer: { name: 'Beta' }, balanceDue: new Prisma.Decimal(10), dueDate: null },
    ];
    const db = { invoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new ReceivablesService();

    const report = await runInTenant(db, () => service.getAgingReport(ASOF));

    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 } },
      include: { customer: true },
    });

    const acme = report.find((r) => r.customerId === 'customer-1');
    expect(acme?.current.toNumber()).toBe(100);
    expect(acme?.days1to30.toNumber()).toBe(50);
    expect(acme?.totalOutstanding.toNumber()).toBe(150);

    const beta = report.find((r) => r.customerId === 'customer-2');
    expect(beta?.days31to60.toNumber()).toBe(200);
    expect(beta?.days90Plus.toNumber()).toBe(300);
    expect(beta?.current.toNumber()).toBe(10); // no dueDate -> current
    expect(beta?.totalOutstanding.toNumber()).toBe(510);

    // sorted by totalOutstanding desc
    expect(report[0].customerId).toBe('customer-2');
  });
});

describe('ReceivablesService.listCustomerBalances', () => {
  it('joins the grouped balances back to customer name/credit limit', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'customer-1', _sum: { balanceDue: new Prisma.Decimal(150) } },
        ]),
      },
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'customer-1', name: 'Acme', creditLimit: new Prisma.Decimal(1000) }]),
      },
    };
    const service = new ReceivablesService();

    const balances = await runInTenant(db, () => service.listCustomerBalances());

    expect(balances).toEqual([
      {
        customerId: 'customer-1',
        customerName: 'Acme',
        creditLimit: expect.any(Prisma.Decimal),
        outstanding: expect.any(Prisma.Decimal),
        availableCredit: expect.any(Prisma.Decimal),
      },
    ]);
    expect(balances[0].availableCredit.toNumber()).toBe(850);
  });

  it('skips the customer lookup entirely when nobody owes anything', async () => {
    const db = {
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn() },
    };
    const service = new ReceivablesService();

    const balances = await runInTenant(db, () => service.listCustomerBalances());

    expect(balances).toEqual([]);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });
});

describe('ReceivablesService.getCustomerStatement', () => {
  it('throws when the customer does not exist', async () => {
    const db = { customer: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReceivablesService();

    await expect(runInTenant(db, () => service.getCustomerStatement('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the open invoices and their total', async () => {
    const db = {
      customer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'customer-1', name: 'Acme', creditLimit: new Prisma.Decimal(500) }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          { balanceDue: new Prisma.Decimal(40) },
          { balanceDue: new Prisma.Decimal(60) },
        ]),
      },
    };
    const service = new ReceivablesService();

    const statement = await runInTenant(db, () => service.getCustomerStatement('customer-1'));

    expect(statement.totalOutstanding.toNumber()).toBe(100);
    expect(statement.invoices).toHaveLength(2);
  });
});

describe('ReceivablesService.listInvoicesBecomingOverdue', () => {
  it('queries the same pre-transition set that refreshOverdueStatuses is about to flip', async () => {
    const invoices = [
      { id: 'inv-1', customer: { name: 'Acme', email: 'acme@example.com' } },
    ];
    const db = { invoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new ReceivablesService();

    const result = await runInTenant(db, () => service.listInvoicesBecomingOverdue(ASOF));

    expect(db.invoice.findMany).toHaveBeenCalledWith({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: ASOF },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
    expect(result).toBe(invoices);
  });
});

describe('ReceivablesService.refreshOverdueStatuses', () => {
  it('marks overdue invoices and reports how many changed', async () => {
    const db = { invoice: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) } };
    const service = new ReceivablesService();

    const result = await runInTenant(db, () => service.refreshOverdueStatuses(ASOF));

    expect(result).toEqual({ updated: 3 });
    expect(db.invoice.updateMany).toHaveBeenCalledWith({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: ASOF },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      data: { status: 'OVERDUE' },
    });
  });
});
