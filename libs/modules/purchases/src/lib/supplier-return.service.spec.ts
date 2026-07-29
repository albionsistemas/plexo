import { Prisma, tenantContextStorage } from '@plexo/database';
import { SupplierReturnService } from './supplier-return.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeReceipt(lines: { id: string; quantity: number }[]) {
  return {
    id: 'receipt-1',
    warehouseId: 'warehouse-1',
    lines: lines.map((l) => ({ id: l.id, quantity: new Prisma.Decimal(l.quantity) })),
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    goodsReceipt: { findUnique: jest.fn().mockResolvedValue(makeReceipt([{ id: 'receipt-line-1', quantity: 200 }])) },
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    supplierReturnLine: { groupBy: jest.fn().mockResolvedValue([]) },
    supplierReturn: {
      create: jest.fn((args) =>
        Promise.resolve({
          id: 'return-1',
          ...args.data,
          goodsReceipt: { id: 'receipt-1', warehouseId: 'warehouse-1' },
          lines: args.data.lines.createMany.data.map(
            (l: { goodsReceiptLineId: string; quantity: Prisma.Decimal }, i: number) => ({
              id: `return-line-${i + 1}`,
              ...l,
              goodsReceiptLine: {
                purchaseOrderLine: { id: 'po-line-1', articleVariantId: 'variant-1' },
              },
            }),
          ),
        }),
      ),
    },
    ...overrides,
  };
}

describe('SupplierReturnService.create', () => {
  it('creates a return for a quantity within what was received on that line', async () => {
    const db = makeDb();
    const service = new SupplierReturnService();

    const supplierReturn = await runAsUser(db, () =>
      service.create({
        goodsReceiptId: 'receipt-1',
        reason: 'tapa en mal estado',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    );

    expect(supplierReturn.id).toBe('return-1');
    expect(db.supplierReturn.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          goodsReceiptId: 'receipt-1',
          reason: 'tapa en mal estado',
          returnedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('allows a second return that exactly completes what was received on that line', async () => {
    const db = makeDb({
      // 120 already returned - only 80 left available of the 200 received.
      supplierReturnLine: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ goodsReceiptLineId: 'receipt-line-1', _sum: { quantity: new Prisma.Decimal(120) } }]),
      },
    });
    const service = new SupplierReturnService();

    await runAsUser(db, () =>
      service.create({
        goodsReceiptId: 'receipt-1',
        reason: 'defectuoso',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 80 }],
      }),
    );

    expect(db.supplierReturn.create).toHaveBeenCalled();
  });

  it('rejects a return that would exceed what is available, with the remaining amount in the message', async () => {
    const db = makeDb({
      supplierReturnLine: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ goodsReceiptLineId: 'receipt-line-1', _sum: { quantity: new Prisma.Decimal(120) } }]),
      },
    });
    const service = new SupplierReturnService();

    await expect(
      runAsUser(db, () =>
        service.create({
          goodsReceiptId: 'receipt-1',
          reason: 'defectuoso',
          lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 81 }],
        }),
      ),
    ).rejects.toThrow('only 80 available to return');
    expect(db.supplierReturn.create).not.toHaveBeenCalled();
  });

  it('rejects a line that does not belong to the referenced receipt', async () => {
    const db = makeDb();
    const service = new SupplierReturnService();

    await expect(
      runAsUser(db, () =>
        service.create({
          goodsReceiptId: 'receipt-1',
          reason: 'defectuoso',
          lines: [{ goodsReceiptLineId: 'not-a-line-of-this-receipt', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('does not belong to this receipt');
  });

  it('rejects when the referenced goods receipt does not exist', async () => {
    const db = makeDb({ goodsReceipt: { findUnique: jest.fn().mockResolvedValue(null) } });
    const service = new SupplierReturnService();

    await expect(
      runAsUser(db, () =>
        service.create({
          goodsReceiptId: 'missing-receipt',
          reason: 'defectuoso',
          lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('Goods receipt not found');
  });
});
