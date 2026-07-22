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
    const findUnique = jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(15) });
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

  it('rejects a SALE_OUT when the atomic decrement matches zero rows (insufficient stock)', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const create = jest.fn();
    const service = new InventoryService(makeEventEmitter());

    await expect(
      runInTenant({ stockLedger: { updateMany }, stockMovement: { create } }, () =>
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

  it('upserts the ledger for a PURCHASE_IN without checking existing stock', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const create = jest.fn().mockResolvedValue({ id: 'movement-2' });
    const findUnique = jest.fn().mockResolvedValue({ quantity: new Prisma.Decimal(20) });
    const service = new InventoryService(makeEventEmitter());

    await runInTenant({ stockLedger: { upsert, findUnique }, stockMovement: { create } }, () =>
      service.recordMovement({
        warehouseId: 'wh-1',
        articleVariantId: 'variant-1',
        type: 'PURCHASE_IN',
        quantity: 20,
      }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: 20 }),
        update: { quantity: { increment: 20 } },
      }),
    );
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
