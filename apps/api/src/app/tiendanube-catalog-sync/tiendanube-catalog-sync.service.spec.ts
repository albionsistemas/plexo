import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { ConnectorService } from '@plexo/connectors';
import { Prisma, tenantContextStorage, type PrismaService } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import { TiendanubeAuthError, type TiendanubeApiClient, type TiendanubeConfigService, type TiendanubeConnector } from '@plexo/tiendanube';
import type { CatalogChangedEvent } from '../dashboard/events.js';
import { TiendanubeCatalogSyncService } from './tiendanube-catalog-sync.service.js';

function makeEventEmitter(): EventEmitter2 {
  return { emit: jest.fn() } as unknown as EventEmitter2;
}

interface Tx {
  $executeRaw: jest.Mock;
  article: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  tiendanubeProductMapping: { findMany: jest.Mock; create: jest.Mock; updateMany: jest.Mock };
}

interface Deps {
  prisma: PrismaService;
  tx: Tx;
  connectorService: jest.Mocked<ConnectorService>;
  tiendanubeConnector: jest.Mocked<TiendanubeConnector>;
  apiClient: jest.Mocked<TiendanubeApiClient>;
  inventoryService: jest.Mocked<InventoryService>;
  config: jest.Mocked<TiendanubeConfigService>;
  eventEmitter: jest.Mocked<EventEmitter2>;
}

function makeVariant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'variant-1',
    sku: 'ABC-123',
    unitPrice: new Prisma.Decimal(150),
    color: null,
    size: null,
    brand: null,
    attributes: null,
    tiendanubeMapping: null,
    ...overrides,
  };
}

function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'article-1',
    name: 'Remera',
    description: null,
    isPublished: true,
    imageUrl: null,
    variants: [makeVariant()],
    ...overrides,
  };
}

function makeConnector(overrides: Record<string, unknown> = {}) {
  return { id: 'connector-1', status: 'CONNECTED', externalAccountId: 'store-999', ...overrides };
}

function makeDeps(
  overrides: {
    article?: Record<string, unknown> | null;
    connector?: Record<string, unknown> | null;
    consolidatedStock?: number;
    publicBaseUrl?: string | undefined;
    articles?: Record<string, unknown>[];
    mappingRows?: Record<string, unknown>[];
  } = {},
): Deps {
  const tx: Tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    article: {
      findUnique: jest.fn().mockResolvedValue(overrides.article === undefined ? makeArticle() : overrides.article),
      findMany: jest.fn().mockResolvedValue(overrides.articles ?? []),
      count: jest.fn().mockResolvedValue(0),
    },
    tiendanubeProductMapping: {
      findMany: jest.fn().mockResolvedValue(overrides.mappingRows ?? []),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mapping-1', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };

  const prisma = { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)) } as unknown as PrismaService;

  return {
    prisma,
    tx,
    connectorService: {
      getConnector: jest.fn().mockResolvedValue(overrides.connector === undefined ? makeConnector() : overrides.connector),
      clearSecrets: jest.fn().mockResolvedValue(undefined),
      setStatus: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ConnectorService>,
    tiendanubeConnector: {
      getValidAccessToken: jest.fn().mockResolvedValue('access-token-1'),
    } as unknown as jest.Mocked<TiendanubeConnector>,
    apiClient: { request: jest.fn() } as unknown as jest.Mocked<TiendanubeApiClient>,
    inventoryService: {
      getConsolidatedStock: jest.fn().mockResolvedValue(new Prisma.Decimal(overrides.consolidatedStock ?? 10)),
    } as unknown as jest.Mocked<InventoryService>,
    config: {
      publicBaseUrl: 'publicBaseUrl' in overrides ? overrides.publicBaseUrl : 'https://oplex.example.com',
    } as unknown as jest.Mocked<TiendanubeConfigService>,
    eventEmitter: makeEventEmitter() as jest.Mocked<EventEmitter2>,
  };
}

function makeService(deps: Deps): TiendanubeCatalogSyncService {
  return new TiendanubeCatalogSyncService(
    deps.prisma,
    deps.connectorService,
    deps.tiendanubeConnector,
    deps.apiClient,
    deps.inventoryService,
    deps.config,
    deps.eventEmitter,
  );
}

function runInTenant<T>(tenantId: string, tx: unknown, fn: () => T): T {
  return tenantContextStorage.run({ tenantId, tx: tx as never }, fn);
}

describe('TiendanubeCatalogSyncService.syncArticle', () => {
  it('creates a new product with attributes/values/initial stock when no mapping exists yet, and persists one mapping row per variant matched by SKU', async () => {
    const deps = makeDeps({
      article: makeArticle({
        variants: [
          makeVariant({ id: 'variant-1', sku: 'REM-S', unitPrice: new Prisma.Decimal(100), attributes: { Talle: 'S' } }),
          makeVariant({ id: 'variant-2', sku: 'REM-M', unitPrice: new Prisma.Decimal(100), attributes: { Talle: 'M' } }),
        ],
      }),
      consolidatedStock: 5,
    });
    (deps.apiClient.request as jest.Mock).mockResolvedValueOnce({
      id: 777,
      variants: [
        { id: 1, product_id: 777, sku: 'REM-S', stock: 5 },
        { id: 2, product_id: 777, sku: 'REM-M', stock: 5 },
      ],
    });
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(true);
    expect(deps.apiClient.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        method: 'POST',
        path: '/products',
        body: expect.objectContaining({
          name: { es: 'Remera' },
          attributes: [{ es: 'Talle' }],
          variants: [
            expect.objectContaining({ sku: 'REM-S', price: '100.00', values: [{ es: 'S' }], stock: 5, stock_management: true }),
            expect.objectContaining({ sku: 'REM-M', price: '100.00', values: [{ es: 'M' }], stock: 5, stock_management: true }),
          ],
        }),
      }),
    );
    expect(deps.tx.tiendanubeProductMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ articleVariantId: 'variant-1', tiendanubeProductId: '777', tiendanubeVariantId: '1' }),
    });
    expect(deps.tx.tiendanubeProductMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ articleVariantId: 'variant-2', tiendanubeProductId: '777', tiendanubeVariantId: '2' }),
    });
  });

  it('updates the product and every already-mapped variant without touching stock', async () => {
    const deps = makeDeps({
      article: makeArticle({
        variants: [
          makeVariant({
            id: 'variant-1',
            sku: 'ABC-123',
            unitPrice: new Prisma.Decimal(200),
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: null, lastPushedImageUrl: null },
          }),
        ],
      }),
    });
    const service = makeService(deps);

    await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(deps.apiClient.request).toHaveBeenNthCalledWith(1, expect.objectContaining({ method: 'PUT', path: '/products/777' }));
    expect(deps.apiClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'PUT',
        path: '/products/777/variants/1',
        body: { sku: 'ABC-123', price: '200.00', values: undefined },
      }),
    );
    expect(deps.inventoryService.getConsolidatedStock).not.toHaveBeenCalled();
  });

  it('adds a brand-new variant (with initial stock) to an already-synced product, and creates its mapping', async () => {
    const deps = makeDeps({
      article: makeArticle({
        variants: [
          makeVariant({
            id: 'variant-1',
            sku: 'ABC-OLD',
            attributes: { Talle: 'S' },
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: null, lastPushedImageUrl: null },
          }),
          makeVariant({ id: 'variant-2', sku: 'ABC-NEW', unitPrice: new Prisma.Decimal(50), attributes: { Talle: 'M' } }),
        ],
      }),
      consolidatedStock: 8,
    });
    (deps.apiClient.request as jest.Mock)
      .mockResolvedValueOnce(undefined) // PUT /products/777
      .mockResolvedValueOnce(undefined) // PUT variant 1
      .mockResolvedValueOnce({ id: 99 }); // POST new variant
    const service = makeService(deps);

    await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(deps.apiClient.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'POST',
        path: '/products/777/variants',
        body: expect.objectContaining({ sku: 'ABC-NEW', values: [{ es: 'M' }], stock: 8, stock_management: true }),
      }),
    );
    expect(deps.tx.tiendanubeProductMapping.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ articleVariantId: 'variant-2', tiendanubeProductId: '777', tiendanubeVariantId: '99' }),
    });
  });

  it('never calls the API when the article is not published', async () => {
    const deps = makeDeps({ article: makeArticle({ isPublished: false }) });
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(false);
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('never calls the API when there is no CONNECTED Tiendanube connector', async () => {
    const deps = makeDeps({ connector: null });
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(false);
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('skips (with a warning, never throws) when variants have inconsistent attribute keys', async () => {
    const deps = makeDeps({
      article: makeArticle({
        variants: [
          makeVariant({ id: 'variant-1', attributes: { Talle: 'S' } }),
          makeVariant({ id: 'variant-2', sku: 'ABC-456', attributes: { Color: 'Rojo' } }),
        ],
      }),
    });
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(false);
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('skips when more than one variant has no distinguishing attribute at all', async () => {
    const deps = makeDeps({
      article: makeArticle({
        variants: [makeVariant({ id: 'variant-1' }), makeVariant({ id: 'variant-2', sku: 'ABC-456' })],
      }),
    });
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(false);
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('syncs fine with a single variant and no attributes at all (the "virtual variant" case)', async () => {
    const deps = makeDeps({ article: makeArticle({ variants: [makeVariant()] }) });
    (deps.apiClient.request as jest.Mock).mockResolvedValueOnce({ id: 777, variants: [{ id: 1, product_id: 777, sku: 'ABC-123', stock: 10 }] });
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(true);
    expect(deps.apiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ attributes: undefined }) }),
    );
  });

  it('uploads a new image via the public src URL and propagates the returned id to every mapping row', async () => {
    const deps = makeDeps({
      article: makeArticle({
        imageUrl: '/uploads/articles/foo.jpg',
        variants: [
          makeVariant({
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: null, lastPushedImageUrl: null },
          }),
        ],
      }),
      mappingRows: [{ id: 'mapping-1', tiendanubeImageId: null, lastPushedImageUrl: null }],
    });
    (deps.apiClient.request as jest.Mock)
      .mockResolvedValueOnce(undefined) // PUT product
      .mockResolvedValueOnce(undefined) // PUT variant
      .mockResolvedValueOnce({ id: 555 }); // POST image
    const service = makeService(deps);

    await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(deps.apiClient.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ method: 'POST', path: '/products/777/images', body: { src: 'https://oplex.example.com/uploads/articles/foo.jpg' } }),
    );
    expect(deps.tx.tiendanubeProductMapping.updateMany).toHaveBeenCalledWith({
      where: { articleVariantId: { in: ['variant-1'] } },
      data: { tiendanubeImageId: '555', lastPushedImageUrl: '/uploads/articles/foo.jpg' },
    });
  });

  it('deletes the previous image before uploading the replacement when imageUrl changed', async () => {
    const deps = makeDeps({
      article: makeArticle({
        imageUrl: '/uploads/articles/new.jpg',
        variants: [
          makeVariant({
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: '111', lastPushedImageUrl: '/uploads/articles/old.jpg' },
          }),
        ],
      }),
      mappingRows: [{ id: 'mapping-1', tiendanubeImageId: '111', lastPushedImageUrl: '/uploads/articles/old.jpg' }],
    });
    (deps.apiClient.request as jest.Mock)
      .mockResolvedValueOnce(undefined) // PUT product
      .mockResolvedValueOnce(undefined) // PUT variant
      .mockResolvedValueOnce(undefined) // DELETE old image
      .mockResolvedValueOnce({ id: 222 }); // POST new image
    const service = makeService(deps);

    await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(deps.apiClient.request).toHaveBeenNthCalledWith(3, expect.objectContaining({ method: 'DELETE', path: '/products/777/images/111' }));
    expect(deps.apiClient.request).toHaveBeenNthCalledWith(4, expect.objectContaining({ method: 'POST', path: '/products/777/images' }));
  });

  it('removes the tracked image (deletes it, clears the fields) when imageUrl is cleared to null', async () => {
    const deps = makeDeps({
      article: makeArticle({
        imageUrl: null,
        variants: [
          makeVariant({
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: '111', lastPushedImageUrl: '/uploads/articles/old.jpg' },
          }),
        ],
      }),
      mappingRows: [{ id: 'mapping-1', tiendanubeImageId: '111', lastPushedImageUrl: '/uploads/articles/old.jpg' }],
    });
    const service = makeService(deps);

    await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(deps.apiClient.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'DELETE', path: '/products/777/images/111' }));
    expect(deps.tx.tiendanubeProductMapping.updateMany).toHaveBeenCalledWith({
      where: { articleVariantId: { in: ['variant-1'] } },
      data: { tiendanubeImageId: null, lastPushedImageUrl: null },
    });
  });

  it('never touches the image when imageUrl already matches what was last pushed', async () => {
    const deps = makeDeps({
      article: makeArticle({
        imageUrl: '/uploads/articles/same.jpg',
        variants: [
          makeVariant({
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: '111', lastPushedImageUrl: '/uploads/articles/same.jpg' },
          }),
        ],
      }),
      mappingRows: [{ id: 'mapping-1', tiendanubeImageId: '111', lastPushedImageUrl: '/uploads/articles/same.jpg' }],
    });
    const service = makeService(deps);

    await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(deps.apiClient.request).not.toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining('/images') }));
    expect(deps.tx.tiendanubeProductMapping.updateMany).not.toHaveBeenCalled();
  });

  it('logs a warning and skips the image without crashing when OAUTH_CALLBACK_BASE_URL is not configured', async () => {
    const deps = makeDeps({
      article: makeArticle({
        imageUrl: '/uploads/articles/foo.jpg',
        variants: [
          makeVariant({
            tiendanubeMapping: { id: 'mapping-1', tiendanubeProductId: '777', tiendanubeVariantId: '1', tiendanubeImageId: null, lastPushedImageUrl: null },
          }),
        ],
      }),
      publicBaseUrl: undefined,
    });
    (deps.apiClient.request as jest.Mock).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncArticle('article-1'));

    expect(result.synced).toBe(true);
    expect(deps.apiClient.request).not.toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining('/images') }));
  });
});

describe('TiendanubeCatalogSyncService.syncAllPublished', () => {
  it('syncs every published article sequentially, collects a readable reason per skip, and emits progress after each one', async () => {
    const deps = makeDeps({
      articles: [
        { id: 'article-1', name: 'Remera' },
        { id: 'article-2', name: 'Pantalón' },
      ],
    });
    const service = makeService(deps);
    const spy = jest
      .spyOn(service, 'syncArticle')
      .mockResolvedValueOnce({ synced: true })
      .mockResolvedValueOnce({ synced: false, reason: 'El artículo no está publicado' });

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncAllPublished());

    expect(deps.tx.article.findMany).toHaveBeenCalledWith({ where: { isPublished: true }, select: { id: true, name: true } });
    expect(spy).toHaveBeenNthCalledWith(1, 'article-1');
    expect(spy).toHaveBeenNthCalledWith(2, 'article-2');
    expect(result).toEqual({
      total: 2,
      synced: 1,
      skipped: [{ articleId: 'article-2', name: 'Pantalón', reason: 'El artículo no está publicado' }],
    });
    expect(deps.eventEmitter.emit).toHaveBeenNthCalledWith(1, 'tiendanube.catalog-sync-progress', {
      tenantId: 'tenant-1',
      done: 1,
      total: 2,
    });
    expect(deps.eventEmitter.emit).toHaveBeenNthCalledWith(2, 'tiendanube.catalog-sync-progress', {
      tenantId: 'tenant-1',
      done: 2,
      total: 2,
    });
  });
});

describe('TiendanubeCatalogSyncService.getCatalogStatus', () => {
  it('returns published vs. synced article counts', async () => {
    const deps = makeDeps();
    deps.tx.article.count = jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(5);
    const service = makeService(deps);

    const result = await runInTenant('tenant-1', deps.tx, () => service.getCatalogStatus());

    expect(deps.tx.article.count).toHaveBeenNthCalledWith(1, { where: { isPublished: true } });
    expect(deps.tx.article.count).toHaveBeenNthCalledWith(2, {
      where: { isPublished: true, variants: { some: { tiendanubeMapping: { isNot: null } } } },
    });
    expect(result).toEqual({ publishedCount: 12, syncedCount: 5 });
  });
});

describe('TiendanubeCatalogSyncService.onCatalogChanged - debounce', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('coalesces a burst of changes to the same article into a single sync', async () => {
    const deps = makeDeps();
    (deps.apiClient.request as jest.Mock).mockResolvedValue({ id: 777, variants: [{ id: 1, product_id: 777, sku: 'ABC-123', stock: 10 }] });
    const service = makeService(deps);
    const event: CatalogChangedEvent = { tenantId: 'tenant-1', articleId: 'article-1' };

    service.onCatalogChanged(event);
    await jest.advanceTimersByTimeAsync(1_000);
    service.onCatalogChanged(event);
    await jest.advanceTimersByTimeAsync(5_000);

    expect(deps.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('marks the connector REVOKED (Fase 6) when Tiendanube returns a real auth error, without crashing', async () => {
    const deps = makeDeps({ mapping: null });
    (deps.apiClient.request as jest.Mock).mockRejectedValueOnce(new TiendanubeAuthError('401', 401));
    const service = makeService(deps);

    service.onCatalogChanged({ tenantId: 'tenant-1', articleId: 'article-1' });
    await jest.advanceTimersByTimeAsync(5_000);

    expect(deps.connectorService.clearSecrets).toHaveBeenCalledWith('connector-1');
    expect(deps.connectorService.setStatus).toHaveBeenCalledWith('connector-1', 'REVOKED', expect.any(String));
  });
});

describe('TiendanubeCatalogSyncService.syncAllPublished - 401/403 stops the batch (Fase 6)', () => {
  it('marks REVOKED, stops processing further articles, and reports the rest as skipped with a clear reason', async () => {
    const deps = makeDeps({
      articles: [
        { id: 'article-1', name: 'Remera' },
        { id: 'article-2', name: 'Pantalón' },
        { id: 'article-3', name: 'Campera' },
      ],
    });
    const service = makeService(deps);
    jest
      .spyOn(service, 'syncArticle')
      .mockResolvedValueOnce({ synced: true })
      .mockRejectedValueOnce(new TiendanubeAuthError('401', 401));

    const result = await runInTenant('tenant-1', deps.tx, () => service.syncAllPublished());

    expect(deps.connectorService.setStatus).toHaveBeenCalledWith('connector-1', 'REVOKED', expect.any(String));
    expect(result).toEqual({
      total: 3,
      synced: 1,
      skipped: [
        { articleId: 'article-2', name: 'Pantalón', reason: 'Tiendanube revocó el acceso durante la sincronización' },
        { articleId: 'article-3', name: 'Campera', reason: 'Tiendanube revocó el acceso durante la sincronización' },
      ],
    });
  });

  it('re-throws any other error untouched (not swallowed as a revocation)', async () => {
    const deps = makeDeps({ articles: [{ id: 'article-1', name: 'Remera' }] });
    const service = makeService(deps);
    jest.spyOn(service, 'syncArticle').mockRejectedValueOnce(new Error('network blip'));

    await expect(runInTenant('tenant-1', deps.tx, () => service.syncAllPublished())).rejects.toThrow('network blip');
    expect(deps.connectorService.setStatus).not.toHaveBeenCalled();
  });
});
