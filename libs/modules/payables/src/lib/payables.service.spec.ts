import { NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { PayablesService } from './payables.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const ASOF = new Date('2026-07-20T00:00:00.000Z');
const daysAgo = (n: number) => new Date(ASOF.getTime() - n * 24 * 60 * 60 * 1000);

describe('PayablesService.getAgingReport', () => {
  it('buckets each open purchase invoice by days overdue and totals per supplier', async () => {
    const invoices = [
      { supplierId: 'supplier-1', supplier: { name: 'Sidex' }, balanceDue: new Prisma.Decimal(100), dueDate: daysAgo(-5) },
      { supplierId: 'supplier-1', supplier: { name: 'Sidex' }, balanceDue: new Prisma.Decimal(50), dueDate: daysAgo(10) },
      { supplierId: 'supplier-2', supplier: { name: 'Distribuidora' }, balanceDue: new Prisma.Decimal(200), dueDate: daysAgo(45) },
      { supplierId: 'supplier-2', supplier: { name: 'Distribuidora' }, balanceDue: new Prisma.Decimal(300), dueDate: daysAgo(95) },
      { supplierId: 'supplier-2', supplier: { name: 'Distribuidora' }, balanceDue: new Prisma.Decimal(10), dueDate: null },
    ];
    const db = { purchaseInvoice: { findMany: jest.fn().mockResolvedValue(invoices) } };
    const service = new PayablesService();

    const report = await runInTenant(db, () => service.getAgingReport(ASOF));

    expect(db.purchaseInvoice.findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 } },
      include: { supplier: true },
    });

    const sidex = report.find((r) => r.supplierId === 'supplier-1');
    expect(sidex?.current.toNumber()).toBe(100);
    expect(sidex?.days1to30.toNumber()).toBe(50);
    expect(sidex?.totalOutstanding.toNumber()).toBe(150);

    const distribuidora = report.find((r) => r.supplierId === 'supplier-2');
    expect(distribuidora?.days31to60.toNumber()).toBe(200);
    expect(distribuidora?.days90Plus.toNumber()).toBe(300);
    expect(distribuidora?.current.toNumber()).toBe(10); // no dueDate -> current
    expect(distribuidora?.totalOutstanding.toNumber()).toBe(510);

    // sorted by totalOutstanding desc
    expect(report[0].supplierId).toBe('supplier-2');
  });
});

describe('PayablesService.listSupplierBalances', () => {
  it('joins the grouped balances back to supplier name', async () => {
    const db = {
      purchaseInvoice: {
        groupBy: jest.fn().mockResolvedValue([
          { supplierId: 'supplier-1', _sum: { balanceDue: new Prisma.Decimal(150) } },
        ]),
      },
      company: {
        findMany: jest.fn().mockResolvedValue([{ id: 'supplier-1', name: 'Sidex' }]),
      },
    };
    const service = new PayablesService();

    const balances = await runInTenant(db, () => service.listSupplierBalances());

    expect(balances).toEqual([
      { supplierId: 'supplier-1', supplierName: 'Sidex', outstanding: expect.any(Prisma.Decimal) },
    ]);
    expect(balances[0].outstanding.toNumber()).toBe(150);
  });

  it('skips the supplier lookup entirely when nobody is owed anything', async () => {
    const db = {
      purchaseInvoice: { groupBy: jest.fn().mockResolvedValue([]) },
      company: { findMany: jest.fn() },
    };
    const service = new PayablesService();

    const balances = await runInTenant(db, () => service.listSupplierBalances());

    expect(balances).toEqual([]);
    expect(db.company.findMany).not.toHaveBeenCalled();
  });
});

describe('PayablesService.getSupplierStatement', () => {
  it('throws when the supplier does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new PayablesService();

    await expect(runInTenant(db, () => service.getSupplierStatement('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the open invoices and their total', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'supplier-1', name: 'Sidex' }) },
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          { balanceDue: new Prisma.Decimal(40) },
          { balanceDue: new Prisma.Decimal(60) },
        ]),
      },
    };
    const service = new PayablesService();

    const statement = await runInTenant(db, () => service.getSupplierStatement('supplier-1'));

    expect(statement.totalOutstanding.toNumber()).toBe(100);
    expect(statement.invoices).toHaveLength(2);
  });
});
