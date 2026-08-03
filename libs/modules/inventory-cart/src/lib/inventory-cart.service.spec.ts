import { tenantContextStorage } from '@plexo/database';
import { InventoryCartService } from './inventory-cart.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T, userId = 'user-1'): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId, tx: db as never }, fn);
}

const VARIANT_ROW = {
  articleVariantId: 'variant-1',
  quantity: { toNumber: () => 2 },
  notes: null,
  articleVariant: {
    articleId: 'article-1',
    sku: 'SKU-1',
    unitPrice: { toNumber: () => 100 },
    article: { name: 'Detergente', imageUrl: null, category: { name: 'Limpieza' } },
  },
};

describe('InventoryCartService', () => {
  it('addItem upserts atomically, incrementing quantity instead of reading then writing', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'variant-1' });
    const upsert = jest.fn().mockResolvedValue({ id: 'item-1', ...VARIANT_ROW });
    const db = { articleVariant: { findUnique }, inventoryCartItem: { upsert } };
    const service = new InventoryCartService();

    const result = await runAsUser(db, () =>
      service.addItem({ articleVariantId: 'variant-1', quantity: 2 }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_userId_articleVariantId: {
            tenantId: 'tenant-1',
            userId: 'user-1',
            articleVariantId: 'variant-1',
          },
        },
        update: expect.objectContaining({ quantity: { increment: 2 } }),
      }),
    );
    expect(result.lineTotal).toBe(200);
  });

  it('addItem rejects an article variant that does not exist', async () => {
    const db = { articleVariant: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new InventoryCartService();

    await expect(
      runAsUser(db, () => service.addItem({ articleVariantId: 'missing', quantity: 1 })),
    ).rejects.toThrow('Article variant not found');
  });

  it("removeItem refuses to delete another user's cart item, even within the same tenant", async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'item-1', userId: 'user-2' });
    const del = jest.fn();
    const db = { inventoryCartItem: { findUnique, delete: del } };
    const service = new InventoryCartService();

    await expect(runAsUser(db, () => service.removeItem('item-1'), 'user-1')).rejects.toThrow(
      'Cart item not found',
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('clear only deletes the current user\'s rows', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 3 });
    const db = { inventoryCartItem: { deleteMany } };
    const service = new InventoryCartService();

    await runAsUser(db, () => service.clear(), 'user-1');

    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });
});
