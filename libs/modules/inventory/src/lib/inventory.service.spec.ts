import { BadRequestException } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { InventoryService } from './inventory.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run(
    { tenantId: 'tenant-1', userId: 'user-1', tx: db as never },
    fn,
  );
}

function makeEventEmitter(): EventEmitter2 {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

describe('InventoryService.recordMovement', () => {
  it('decrements the ledger and records the movement for a SALE_OUT with enough stock', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(
      { stockLedger: { updateMany, findUnique }, stockMovement: { create } },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SALE_OUT',
          quantity: 5,
        }),
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { warehouseId: 'wh-1', articleVariantId: 'variant-1', quantity: { gte: 5 } },
      data: { quantity: { increment: -5 } },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        warehouseId: 'wh-1',
        articleVariantId: 'variant-1',
        type: 'SALE_OUT',
        quantity: 5,
      }),
    });
    expect(result).toEqual({ id: 'movement-1' });
  });

  it('stamps the SALE_OUT movement with the ledger avg cost without changing it', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const create = jest.fn().mockResolvedValue({ id: 'movement-1' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(15), avgUnitCost: new Prisma.Decimal(50) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(
      { stockLedger: { updateMany, findUnique }, stockMovement: { create } },
      () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SALE_OUT',
          quantity: 5,
        }),
    );

    const created = create.mock.calls[0][0].data;
    expect(created.unitCost).toBeInstanceOf(Prisma.Decimal);
    expect((created.unitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(50);
    // The average itself is never written to on an outbound movement - only
    // `updateMany` touches quantity, `avgUnitCost` is left alone.
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: { increment: -5 } } }),
    );
  });

  it('rejects a SALE_OUT when the atomic decrement matches zero rows (insufficient stock)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest.fn();
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({ stockLedger: { updateMany, findUnique }, stockMovement: { create } }, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'SALE_OUT',
          quantity: 999,
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(create).not.toHaveBeenCalled();
  });

  it('rejects a PURCHASE_IN with no unitCost', async () => {
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({}, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: 20,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('upserts the ledger for a PURCHASE_IN without checking existing stock', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-2' });
    const findUnique = jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(20), avgUnitCost: null });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant({ stockLedger: { upsert, findUnique }, stockMovement: { create } }, () =>
      service.recordMovement({
        warehouseId: 'wh-1',
        articleVariantId: 'variant-1',
        type: 'PURCHASE_IN',
        quantity: 20,
        unitCost: 100,
      }),
    );

    const call = upsert.mock.calls[0][0];
    expect(call.create.quantity).toBe(20);
    expect(call.update).toEqual({
      quantity: { increment: 20 },
      avgUnitCost: expect.any(Prisma.Decimal),
    });
    expect((call.update.avgUnitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(100);
  });

  it('re-weights the average cost when purchasing on top of existing costed stock', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-3' });
    // 10 units @ 100 already in stock; buying 10 more @ 200 -> avg should be 150.
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(10), avgUnitCost: new Prisma.Decimal(100) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant({ stockLedger: { upsert, findUnique }, stockMovement: { create } }, () =>
      service.recordMovement({
        warehouseId: 'wh-1',
        articleVariantId: 'variant-1',
        type: 'PURCHASE_IN',
        quantity: 10,
        unitCost: 200,
      }),
    );

    const call = upsert.mock.calls[0][0];
    expect((call.update.avgUnitCost as InstanceType<typeof Prisma.Decimal>).toNumber()).toBe(150);
  });

  it('leaves the average untouched for a RETURN posted without a unitCost', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-4' });
    const findUnique = jest
      .fn()
      .mockResolvedValue({ quantity: new Prisma.Decimal(10), avgUnitCost: new Prisma.Decimal(100) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant({ stockLedger: { upsert, findUnique }, stockMovement: { create } }, () =>
      service.recordMovement({
        warehouseId: 'wh-1',
        articleVariantId: 'variant-1',
        type: 'RETURN',
        quantity: 3,
      }),
    );

    const call = upsert.mock.calls[0][0];
    expect(call.update).toEqual({ quantity: { increment: 3 } });
    expect(create.mock.calls[0][0].data.unitCost).toBeNull();
  });

  it('rejects a zero-quantity ADJUSTMENT before touching the database', async () => {
    const service = new InventoryService(makeEventEmitter());
    const updateMany = jest.fn();

    await expect(
      runInTenant({ stockLedger: { updateMany } }, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'ADJUSTMENT',
          quantity: 0,
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    expect(updateMany).not.toHaveBeenCalled();
  });

  it('rejects a non-positive quantity for PURCHASE_IN/SALE_OUT/RETURN', async () => {
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({}, () =>
        service.recordMovement({
          warehouseId: 'wh-1',
          articleVariantId: 'variant-1',
          type: 'PURCHASE_IN',
          quantity: -1,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('InventoryService.getConsolidatedStock', () => {
  it('sums stock across warehouses', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantity: new Prisma.Decimal(42) } });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant({ stockLedger: { aggregate } }, () =>
      service.getConsolidatedStock('variant-1'),
    );

    expect(result.toNumber()).toBe(42);
  });

  it('returns zero when there is no ledger row at all', async () => {
    const aggregate = jest.fn().mockResolvedValue({ _sum: { quantity: null } });
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant({ stockLedger: { aggregate } }, () =>
      service.getConsolidatedStock('variant-1'),
    );

    expect(result.toNumber()).toBe(0);
  });
});

describe('InventoryService.listReorderSuggestions', () => {
  it('only returns pairs where current stock is below the configured minimum', async () => {
    const findManyMinimums = jest.fn().mockResolvedValue([
      { warehouseId: 'wh-1', articleVariantId: 'v-1', minimumQuantity: new Prisma.Decimal(10) },
      { warehouseId: 'wh-1', articleVariantId: 'v-2', minimumQuantity: new Prisma.Decimal(5) },
    ]);
    const findManyLedger = jest.fn().mockResolvedValue([
      { warehouseId: 'wh-1', articleVariantId: 'v-1', quantity: new Prisma.Decimal(3) },
      { warehouseId: 'wh-1', articleVariantId: 'v-2', quantity: new Prisma.Decimal(50) },
    ]);
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(
      {
        minimumStock: { findMany: findManyMinimums },
        stockLedger: { findMany: findManyLedger },
      },
      () => service.listReorderSuggestions(),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ warehouseId: 'wh-1', articleVariantId: 'v-1' });
  });

  it('returns an empty list without querying the ledger when there are no minimums configured', async () => {
    const findManyMinimums = jest.fn().mockResolvedValue([]);
    const findManyLedger = jest.fn();
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(
      {
        minimumStock: { findMany: findManyMinimums },
        stockLedger: { findMany: findManyLedger },
      },
      () => service.listReorderSuggestions(),
    );

    expect(result).toEqual([]);
    expect(findManyLedger).not.toHaveBeenCalled();
  });
});

describe('InventoryService.updateArticle', () => {
  function makeSupplier(overrides: Partial<{ active: boolean; roles: { role: string }[] }> = {}) {
    return {
      id: 'supplier-1',
      active: overrides.active ?? true,
      roles: overrides.roles ?? [{ role: 'SUPPLIER' }],
    };
  }

  it('sets the preferred supplier once it validates as an active SUPPLIER company', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier()) },
      article: { update: jest.fn((args) => Promise.resolve({ id: 'article-1', ...args.data })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(db, () => service.updateArticle('article-1', { preferredSupplierId: 'supplier-1' }));

    expect(db.company.findUnique).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      include: { roles: true },
    });
    expect(db.article.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preferredSupplierId: 'supplier-1' }) }),
    );
  });

  it('rejects a company that is not flagged as a supplier', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier({ roles: [{ role: 'CUSTOMER' }] })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant(db, () => service.updateArticle('article-1', { preferredSupplierId: 'supplier-1' })),
    ).rejects.toThrow('not flagged as a supplier');
  });

  it('rejects an inactive supplier', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier({ active: false })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant(db, () => service.updateArticle('article-1', { preferredSupplierId: 'supplier-1' })),
    ).rejects.toThrow('inactive');
  });

  it('clears the preferred supplier when given null, with no validation lookup', async () => {
    const db = {
      company: { findUnique: jest.fn() },
      article: { update: jest.fn((args) => Promise.resolve({ id: 'article-1', ...args.data })) },
    };
    const service = new InventoryService(makeEventEmitter());

    const result = await runInTenant(db, () =>
      service.updateArticle('article-1', { preferredSupplierId: null }),
    );

    expect(db.company.findUnique).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ preferredSupplierId: null }));
  });

  it('leaves the preferred supplier untouched when the field is omitted', async () => {
    const db = {
      company: { findUnique: jest.fn() },
      article: { update: jest.fn((args) => Promise.resolve({ id: 'article-1', ...args.data })) },
    };
    const service = new InventoryService(makeEventEmitter());

    await runInTenant(db, () => service.updateArticle('article-1', { isPublished: true }));

    expect(db.company.findUnique).not.toHaveBeenCalled();
    expect(db.article.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ preferredSupplierId: undefined }) }),
    );
  });
});
