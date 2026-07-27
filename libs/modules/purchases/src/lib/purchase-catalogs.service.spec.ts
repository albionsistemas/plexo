import { tenantContextStorage } from '@plexo/database';
import { PurchaseCatalogsService } from './purchase-catalogs.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeDb() {
  return {
    transportMode: {
      findMany: jest.fn().mockResolvedValue([{ id: 'tm-1', name: 'Retira el proveedor', active: true }]),
      create: jest.fn().mockResolvedValue({ id: 'tm-2', name: 'Envío a domicilio', active: true }),
      findUnique: jest.fn().mockResolvedValue({ id: 'tm-1', name: 'Retira el proveedor', active: true }),
      update: jest.fn().mockResolvedValue({ id: 'tm-1', name: 'Renombrado', active: false }),
    },
    paymentTerm: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    deliveryTime: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('PurchaseCatalogsService', () => {
  it('lists only active items by default, routing to the right Prisma delegate per type', async () => {
    const db = makeDb();
    const service = new PurchaseCatalogsService();

    const result = await runInTenant(db, () => service.list('transport-modes', false));

    expect(db.transportMode.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', active: true },
      orderBy: { name: 'asc' },
    });
    expect(db.paymentTerm.findMany).not.toHaveBeenCalled();
    expect(result).toEqual([{ id: 'tm-1', name: 'Retira el proveedor', active: true }]);
  });

  it('includes inactive items when asked', async () => {
    const db = makeDb();
    const service = new PurchaseCatalogsService();

    await runInTenant(db, () => service.list('transport-modes', true));

    expect(db.transportMode.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      orderBy: { name: 'asc' },
    });
  });

  it('creates a new catalog item scoped to the current tenant', async () => {
    const db = makeDb();
    const service = new PurchaseCatalogsService();

    const created = await runInTenant(db, () => service.create('transport-modes', { name: 'Envío a domicilio' }));

    expect(db.transportMode.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', name: 'Envío a domicilio' },
    });
    expect(created.name).toBe('Envío a domicilio');
  });

  it('rejects an unknown catalog type', async () => {
    const db = makeDb();
    const service = new PurchaseCatalogsService();

    await expect(runInTenant(db, () => service.list('not-a-real-type', false))).rejects.toThrow(
      'Unknown catalog type',
    );
  });

  it('404s updating an item that does not exist', async () => {
    const db = makeDb();
    db.transportMode.findUnique.mockResolvedValueOnce(null);
    const service = new PurchaseCatalogsService();

    await expect(
      runInTenant(db, () => service.update('transport-modes', 'missing-id', { active: false })),
    ).rejects.toThrow('Catalog item not found');
  });

  it('toggles active via update', async () => {
    const db = makeDb();
    const service = new PurchaseCatalogsService();

    const result = await runInTenant(db, () => service.update('transport-modes', 'tm-1', { active: false }));

    expect(db.transportMode.update).toHaveBeenCalledWith({
      where: { id: 'tm-1' },
      data: { name: undefined, active: false },
    });
    expect(result.active).toBe(false);
  });
});
