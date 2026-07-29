import { Prisma, tenantContextStorage } from '@plexo/database';
import { GoodsReceiptService } from './goods-receipt.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeSentOrder(lines: { id: string; quantity: number }[]) {
  return {
    id: 'po-1',
    status: 'SENT',
    lines: lines.map((l) => ({ id: l.id, quantity: new Prisma.Decimal(l.quantity) })),
  };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    purchaseOrder: { findUnique: jest.fn().mockResolvedValue(makeSentOrder([{ id: 'line-1', quantity: 200 }])) },
    warehouse: { findUnique: jest.fn().mockResolvedValue({ id: 'warehouse-1' }) },
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    goodsReceiptLine: { groupBy: jest.fn().mockResolvedValue([]) },
    goodsReceipt: {
      create: jest.fn((args) =>
        Promise.resolve({
          id: 'receipt-1',
          ...args.data,
          lines: args.data.lines.createMany.data.map((l: { purchaseOrderLineId: string; quantity: Prisma.Decimal }, i: number) => ({
            id: `receipt-line-${i + 1}`,
            ...l,
            purchaseOrderLine: { id: l.purchaseOrderLineId, articleVariantId: 'variant-1', unitCost: new Prisma.Decimal(150) },
          })),
        }),
      ),
    },
    ...overrides,
  };
}

describe('GoodsReceiptService.create', () => {
  it('creates a receipt for the full ordered quantity against a SENT order', async () => {
    const db = makeDb();
    const service = new GoodsReceiptService();

    const receipt = await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 200 }],
      }),
    );

    expect(receipt.id).toBe('receipt-1');
    expect(db.goodsReceipt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          receivedByUserId: 'user-1',
        }),
      }),
    );
  });

  it('allows a second partial receipt that exactly completes what is pending', async () => {
    const db = makeDb({
      // 120 already received - only 80 left of the 200 ordered.
      goodsReceiptLine: {
        groupBy: jest.fn().mockResolvedValue([{ purchaseOrderLineId: 'line-1', _sum: { quantity: new Prisma.Decimal(120) } }]),
      },
    });
    const service = new GoodsReceiptService();

    await runAsUser(db, () =>
      service.create({
        purchaseOrderId: 'po-1',
        warehouseId: 'warehouse-1',
        lines: [{ purchaseOrderLineId: 'line-1', quantity: 80 }],
      }),
    );

    expect(db.goodsReceipt.create).toHaveBeenCalled();
  });

  it('rejects a receipt that would exceed what is still pending, with the remaining amount in the message', async () => {
    const db = makeDb({
      goodsReceiptLine: {
        groupBy: jest.fn().mockResolvedValue([{ purchaseOrderLineId: 'line-1', _sum: { quantity: new Prisma.Decimal(120) } }]),
      },
    });
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'line-1', quantity: 81 }],
        }),
      ),
    ).rejects.toThrow('only 80 left to receive');
    expect(db.goodsReceipt.create).not.toHaveBeenCalled();
  });

  it('rejects receiving against an order that is not SENT', async () => {
    const db = makeDb({
      purchaseOrder: { findUnique: jest.fn().mockResolvedValue({ ...makeSentOrder([{ id: 'line-1', quantity: 200 }]), status: 'DRAFT' }) },
    });
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'line-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('Only a SENT purchase order');
  });

  it('rejects a line that does not belong to the referenced order', async () => {
    const db = makeDb();
    const service = new GoodsReceiptService();

    await expect(
      runAsUser(db, () =>
        service.create({
          purchaseOrderId: 'po-1',
          warehouseId: 'warehouse-1',
          lines: [{ purchaseOrderLineId: 'not-a-line-of-this-order', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('does not belong to this order');
  });
});
