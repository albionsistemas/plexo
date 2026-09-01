import type { ConnectorService } from '@plexo/connectors';
import { Prisma, type PrismaService } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import { TiendanubeAuthError, type TiendanubeApiClient, type TiendanubeConnector } from '@plexo/tiendanube';
import type { StockUpdatedEvent } from '../dashboard/events.js';
import { TiendanubeStockSyncService } from './tiendanube-stock-sync.service.js';

interface Tx {
  $executeRaw: jest.Mock;
  articleVariant: { findUnique: jest.Mock };
  tiendanubeProductMapping: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
}

interface Deps {
  prisma: PrismaService;
  tx: Tx;
  connectorService: jest.Mocked<ConnectorService>;
  tiendanubeConnector: jest.Mocked<TiendanubeConnector>;
  apiClient: jest.Mocked<TiendanubeApiClient>;
  inventoryService: jest.Mocked<InventoryService>;
}

function makeVariant(overrides: Record<string, unknown> = {}) {
  return { sku: 'ABC-123', article: { isPublished: true }, ...overrides };
}

function makeConnector(overrides: Record<string, unknown> = {}) {
  return { id: 'connector-1', status: 'CONNECTED', externalAccountId: 'store-999', ...overrides };
}

function makeDeps(
  overrides: {
    articleVariant?: Record<string, unknown> | null;
    connector?: Record<string, unknown> | null;
    mapping?: Record<string, unknown> | null;
    consolidatedStock?: number;
  } = {},
): Deps {
  const tx: Tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    articleVariant: {
      findUnique: jest.fn().mockResolvedValue(overrides.articleVariant === undefined ? makeVariant() : overrides.articleVariant),
    },
    tiendanubeProductMapping: {
      findUnique: jest.fn().mockResolvedValue(overrides.mapping ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mapping-1', ...data })),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mapping-1', ...data })),
    },
  };

  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

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
    apiClient: {
      request: jest.fn(),
    } as unknown as jest.Mocked<TiendanubeApiClient>,
    inventoryService: {
      getConsolidatedStock: jest.fn().mockResolvedValue(new Prisma.Decimal(overrides.consolidatedStock ?? 7)),
    } as unknown as jest.Mocked<InventoryService>,
  };
}

function makeService(deps: Deps): TiendanubeStockSyncService {
  return new TiendanubeStockSyncService(deps.prisma, deps.connectorService, deps.tiendanubeConnector, deps.apiClient, deps.inventoryService);
}

function makeEvent(overrides: Partial<StockUpdatedEvent> = {}): StockUpdatedEvent {
  return { tenantId: 'tenant-1', warehouseId: 'wh-1', articleVariantId: 'variant-1', newQuantity: '7', ...overrides };
}

const DEBOUNCE_MS = 5_000;

describe('TiendanubeStockSyncService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves the product/variant by SKU the first time, persists the mapping, and pushes the consolidated stock', async () => {
    const deps = makeDeps({ mapping: null, consolidatedStock: 7 });
    (deps.apiClient.request as jest.Mock)
      .mockResolvedValueOnce({ id: 555, variants: [{ id: 20, product_id: 555, sku: 'ABC-123', stock: 3 }] }) // GET /products/sku/:sku
      .mockResolvedValueOnce(undefined); // PUT
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ method: 'GET', path: '/products/sku/ABC-123' }),
    );
    expect(deps.apiClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ method: 'PUT', path: '/products/555/variants/20', body: { stock: 7 } }),
    );
    expect(deps.tx.tiendanubeProductMapping.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', articleVariantId: 'variant-1', tiendanubeProductId: '555', tiendanubeVariantId: '20' },
    });
    expect(deps.tx.tiendanubeProductMapping.update).toHaveBeenCalledWith({
      where: { id: 'mapping-1' },
      data: { lastPushedStock: 7, lastPushedAt: expect.any(Date) },
    });
  });

  it('reuses an existing mapping without looking up the SKU again', async () => {
    const deps = makeDeps({
      mapping: { id: 'mapping-1', tiendanubeProductId: '555', tiendanubeVariantId: '20', lastPushedStock: new Prisma.Decimal(3) },
      consolidatedStock: 9,
    });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);
    expect(deps.apiClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT', path: '/products/555/variants/20', body: { stock: 9 } }),
    );
  });

  it('skips the API call entirely when the consolidated stock already matches what was last pushed', async () => {
    const deps = makeDeps({
      mapping: { id: 'mapping-1', tiendanubeProductId: '555', tiendanubeVariantId: '20', lastPushedStock: new Prisma.Decimal(7) },
      consolidatedStock: 7,
    });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).not.toHaveBeenCalled();
    expect(deps.tiendanubeConnector.getValidAccessToken).not.toHaveBeenCalled();
  });

  it('logs and never creates a mapping when the SKU is not found in the store', async () => {
    const deps = makeDeps({ mapping: null });
    (deps.apiClient.request as jest.Mock).mockRejectedValueOnce(new Error('404'));
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);
    expect(deps.tx.tiendanubeProductMapping.create).not.toHaveBeenCalled();
  });

  it('never creates a mapping when the returned product has no variant with the matching SKU', async () => {
    const deps = makeDeps({ mapping: null });
    (deps.apiClient.request as jest.Mock).mockResolvedValueOnce({
      id: 555,
      variants: [{ id: 99, product_id: 555, sku: 'OTHER-SKU', stock: 1 }],
    });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);
    expect(deps.tx.tiendanubeProductMapping.create).not.toHaveBeenCalled();
  });

  it('never touches the mapping/connector/inventory when the article is not published', async () => {
    const deps = makeDeps({ articleVariant: makeVariant({ article: { isPublished: false } }) });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.connectorService.getConnector).not.toHaveBeenCalled();
    expect(deps.inventoryService.getConsolidatedStock).not.toHaveBeenCalled();
  });

  it('does nothing when the tenant has no CONNECTED Tiendanube connector', async () => {
    const deps = makeDeps({ connector: null });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.inventoryService.getConsolidatedStock).not.toHaveBeenCalled();
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('does nothing when the connector exists but is not CONNECTED (e.g. REVOKED)', async () => {
    const deps = makeDeps({ connector: makeConnector({ status: 'REVOKED' }) });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('floors a fractional consolidated stock before pushing (never overselling a fraction the store cannot honor)', async () => {
    const deps = makeDeps({
      mapping: { id: 'mapping-1', tiendanubeProductId: '555', tiendanubeVariantId: '20', lastPushedStock: null },
      consolidatedStock: 4.9,
    });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.apiClient.request).toHaveBeenCalledWith(expect.objectContaining({ body: { stock: 4 } }));
  });

  it('coalesces a burst of movements against the same variant into a single push', async () => {
    const deps = makeDeps({ mapping: { id: 'mapping-1', tiendanubeProductId: '555', tiendanubeVariantId: '20', lastPushedStock: null } });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent({ newQuantity: '1' }));
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS - 1_000);
    service.onStockUpdated(makeEvent({ newQuantity: '2' }));
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS - 1_000);
    service.onStockUpdated(makeEvent({ newQuantity: '3' }));
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.inventoryService.getConsolidatedStock).toHaveBeenCalledTimes(1);
    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('keeps independent debounce timers for different tenants/variants - neither one blocks the other', async () => {
    const deps = makeDeps({ mapping: { id: 'mapping-1', tiendanubeProductId: '555', tiendanubeVariantId: '20', lastPushedStock: null } });
    const service = makeService(deps);

    service.onStockUpdated(makeEvent({ tenantId: 'tenant-1', articleVariantId: 'variant-1' }));
    service.onStockUpdated(makeEvent({ tenantId: 'tenant-2', articleVariantId: 'variant-2' }));
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(deps.apiClient.request).toHaveBeenCalledTimes(2);
  });
});

describe('TiendanubeStockSyncService - 401/403 marks the connector REVOKED (Fase 6)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('marks REVOKED and clears secrets when resolving the SKU comes back with a real auth error (not "SKU not found")', async () => {
    const deps = makeDeps({ mapping: null });
    (deps.apiClient.request as jest.Mock).mockRejectedValueOnce(new TiendanubeAuthError('401', 401));
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.connectorService.clearSecrets).toHaveBeenCalledWith('connector-1');
    expect(deps.connectorService.setStatus).toHaveBeenCalledWith('connector-1', 'REVOKED', expect.any(String));
    expect(deps.tx.tiendanubeProductMapping.create).not.toHaveBeenCalled();
  });

  it('does nothing when the connector is already REVOKED by the time the retry runs - idempotent', async () => {
    const deps = makeDeps({ mapping: null });
    (deps.connectorService.getConnector as jest.Mock)
      .mockResolvedValueOnce(makeConnector()) // read inside push()
      .mockResolvedValueOnce({ id: 'connector-1', status: 'REVOKED', externalAccountId: 'store-999' }); // read inside revokeOnAuthError()
    (deps.apiClient.request as jest.Mock).mockRejectedValueOnce(new TiendanubeAuthError('401', 401));
    const service = makeService(deps);

    service.onStockUpdated(makeEvent());
    await jest.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(deps.connectorService.setStatus).not.toHaveBeenCalled();
  });
});
