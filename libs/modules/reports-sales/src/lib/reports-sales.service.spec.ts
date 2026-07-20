import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReportsSalesService } from './reports-sales.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ReportsSalesService.getSalesByCustomer', () => {
  it('joins grouped totals back to customer name and sorts by total sales desc', async () => {
    const db = {
      invoice: {
        groupBy: jest.fn().mockResolvedValue([
          { customerId: 'c1', _sum: { total: new Prisma.Decimal(100) }, _count: 2 },
          { customerId: 'c2', _sum: { total: new Prisma.Decimal(500) }, _count: 1 },
        ]),
      },
      customer: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'c1', name: 'Acme' },
            { id: 'c2', name: 'Beta' },
          ]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByCustomer());

    expect(db.invoice.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'CANCELLED' } }) }),
    );
    expect(result[0]).toMatchObject({ customerId: 'c2', customerName: 'Beta' });
    expect(result[1]).toMatchObject({ customerId: 'c1', customerName: 'Acme' });
  });

  it('skips the customer lookup when there are no sales in range', async () => {
    const db = {
      invoice: { groupBy: jest.fn().mockResolvedValue([]) },
      customer: { findMany: jest.fn() },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByCustomer());

    expect(result).toEqual([]);
    expect(db.customer.findMany).not.toHaveBeenCalled();
  });
});

describe('ReportsSalesService.getSalesByProduct', () => {
  it('joins grouped line totals back to article/variant info and sorts by revenue desc', async () => {
    const db = {
      invoiceLine: {
        groupBy: jest.fn().mockResolvedValue([
          {
            articleVariantId: 'v1',
            _sum: { quantity: new Prisma.Decimal(3), lineTotal: new Prisma.Decimal(150) },
          },
          {
            articleVariantId: 'v2',
            _sum: { quantity: new Prisma.Decimal(1), lineTotal: new Prisma.Decimal(400) },
          },
        ]),
      },
      articleVariant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'v1', sku: 'SKU-1', article: { name: 'Widget' } },
          { id: 'v2', sku: 'SKU-2', article: { name: 'Gadget' } },
        ]),
      },
    };
    const service = new ReportsSalesService();

    const result = await runInTenant(db, () => service.getSalesByProduct());

    expect(db.invoiceLine.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          invoice: expect.objectContaining({ status: { not: 'CANCELLED' } }),
        }),
      }),
    );
    expect(result[0]).toMatchObject({ articleVariantId: 'v2', sku: 'SKU-2', articleName: 'Gadget' });
    expect(result[1]).toMatchObject({ articleVariantId: 'v1', sku: 'SKU-1', articleName: 'Widget' });
  });
});
