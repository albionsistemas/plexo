import { createHmac } from 'node:crypto';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { CompaniesService } from '@plexo/companies';
import type { ConnectorService } from '@plexo/connectors';
import { type PrismaService } from '@plexo/database';
import type { TiendanubeApiClient, TiendanubeConfigService, TiendanubeConnector, TiendanubeOrderResource } from '@plexo/tiendanube';
import { TiendanubeWebhookService, type TiendanubeWebhookInput } from './tiendanube-webhook.service.js';

const SECRET = 'test-app-secret';

/** Independently signs the raw body the same way Tiendanube does (hex
 * HMAC-SHA256 of the raw bytes), re-derived here rather than imported from
 * the SUT - same reasoning as tiendanube-webhook-signature.util.spec.ts. */
function sign(rawBody: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

function makeOrder(overrides: Partial<TiendanubeOrderResource> = {}): TiendanubeOrderResource {
  return {
    id: 555,
    number: 42,
    contact_name: 'Juan Pérez',
    contact_email: 'juan@example.com',
    contact_phone: '+5491122334455',
    contact_identification: '20-12345678-9',
    currency: 'ARS',
    total: '1500.00',
    products: [{ id: 1, product_id: 10, variant_id: 20, sku: 'ABC-123', name: 'Remera', price: '1500.00', quantity: 1 }],
    ...overrides,
  };
}

/** `overrides.rawBody`/`overrides.payload` default to the same order/paid
 * shape - `signatureHeader` is always derived from whatever `rawBody` ends
 * up being UNLESS the caller explicitly overrides it (only the signature
 * tests do that), so every other test gets a valid signature "for free"
 * without having to also fake the body it covers. */
function baseInput(overrides: Partial<TiendanubeWebhookInput> = {}): TiendanubeWebhookInput {
  const payload = overrides.payload ?? { store_id: 999, event: 'order/paid', id: 555 };
  const rawBody = overrides.rawBody ?? Buffer.from(JSON.stringify(payload));
  return {
    rawBody,
    signatureHeader: overrides.signatureHeader ?? sign(rawBody.toString('utf8')),
    storeId: '999',
    event: 'order/paid',
    orderId: '555',
    payload,
    ...overrides,
  };
}

interface Tx {
  $executeRaw: jest.Mock;
  company: { findFirst: jest.Mock };
  articleVariant: { findUnique: jest.Mock };
  tiendanubeOrder: { upsert: jest.Mock };
}

interface Deps {
  prisma: PrismaService;
  tx: Tx;
  config: jest.Mocked<TiendanubeConfigService>;
  connectorService: jest.Mocked<ConnectorService>;
  connector: jest.Mocked<TiendanubeConnector>;
  apiClient: jest.Mocked<TiendanubeApiClient>;
  companiesService: jest.Mocked<CompaniesService>;
  eventEmitter: jest.Mocked<EventEmitter2>;
}

function makeDeps(
  overrides: {
    webhookEventExisting?: Record<string, unknown> | null;
    resolvedTenantId?: string | null;
    connector?: Record<string, unknown> | null;
    order?: TiendanubeOrderResource;
    articleVariant?: Record<string, unknown> | null;
  } = {},
): Deps {
  const tx: Tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    company: { findFirst: jest.fn().mockResolvedValue(null) },
    articleVariant: {
      findUnique: jest.fn().mockResolvedValue(overrides.articleVariant === undefined ? { id: 'variant-1' } : overrides.articleVariant),
    },
    tiendanubeOrder: { upsert: jest.fn().mockResolvedValue({ id: 'tn-order-1' }) },
  };

  const prisma = {
    webhookEvent: {
      findUnique: jest.fn().mockResolvedValue(overrides.webhookEventExisting ?? null),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'event-1', processed: false, ...data })),
      update: jest.fn().mockResolvedValue({}),
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValue(overrides.resolvedTenantId === null ? [] : [{ tenant_id: overrides.resolvedTenantId ?? 'tenant-1' }]),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
  } as unknown as PrismaService;

  return {
    prisma,
    tx,
    config: { clientSecret: SECRET } as unknown as jest.Mocked<TiendanubeConfigService>,
    connectorService: {
      getConnector: jest
        .fn()
        .mockResolvedValue(overrides.connector === undefined ? { id: 'connector-1', status: 'CONNECTED' } : overrides.connector),
      clearSecrets: jest.fn().mockResolvedValue(undefined),
      setStatus: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ConnectorService>,
    connector: {
      getValidAccessToken: jest.fn().mockResolvedValue('tn-access-token'),
    } as unknown as jest.Mocked<TiendanubeConnector>,
    apiClient: {
      request: jest.fn().mockResolvedValue(overrides.order ?? makeOrder()),
    } as unknown as jest.Mocked<TiendanubeApiClient>,
    companiesService: {
      createCompany: jest.fn().mockResolvedValue({ id: 'new-company-1' }),
    } as unknown as jest.Mocked<CompaniesService>,
    eventEmitter: { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>,
  };
}

function makeService(deps: Deps): TiendanubeWebhookService {
  return new TiendanubeWebhookService(
    deps.prisma,
    deps.config,
    deps.connectorService,
    deps.connector,
    deps.apiClient,
    deps.companiesService,
    deps.eventEmitter,
  );
}

describe('TiendanubeWebhookService.handleNotification - signature', () => {
  it('rejects an invalid signature and never touches the database', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput({ signatureHeader: 'deadbeef' }))).rejects.toThrow(
      'Firma de Tiendanube inválida',
    );

    expect(deps.prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
    expect(deps.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects when TIENDANUBE_CLIENT_SECRET is not configured, regardless of signature shape', async () => {
    const deps = makeDeps();
    (deps.config as { clientSecret?: string }).clientSecret = undefined;
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput())).rejects.toThrow('Firma de Tiendanube inválida');
  });

  it('logs the invalid attempt as its own unprocessed WebhookEvent row before rejecting', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput({ signatureHeader: 'deadbeef' }))).rejects.toThrow();

    expect(deps.prisma.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ signatureOk: false, error: expect.any(String) }) }),
    );
  });
});

describe('TiendanubeWebhookService.handleNotification - event filtering', () => {
  it('ignores events other than order/paid without creating a WebhookEvent row (decisión #1: sólo order/paid dispara algo)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput({ event: 'order/created' }));

    expect(deps.prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('ignores a notification with no order id', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput({ orderId: undefined }));

    expect(deps.prisma.webhookEvent.findUnique).not.toHaveBeenCalled();
  });
});

describe('TiendanubeWebhookService.handleNotification - tenant resolution', () => {
  it('resolves the tenant from store_id via find_tenant_by_connector and imports inside that tenant context', async () => {
    const deps = makeDeps({ resolvedTenantId: 'tenant-42' });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.prisma.$queryRaw).toHaveBeenCalled();
    expect(deps.connectorService.getConnector).toHaveBeenCalled();
    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId_tiendanubeOrderId: { tenantId: 'tenant-42', tiendanubeOrderId: '555' } } }),
    );
  });

  it('acks without importing anything when no CONNECTED connector matches this store_id (never guessed at)', async () => {
    const deps = makeDeps({ resolvedTenantId: null });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.apiClient.request).not.toHaveBeenCalled();
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ error: expect.stringContaining('999') }) }),
    );
    // Left unprocessed on purpose - not reintentable by itself, but also
    // never marked as if it had succeeded.
    expect(deps.prisma.webhookEvent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });

  it('two different store_ids resolve to two different tenants - never bleeds one tenant into another', async () => {
    const depsA = makeDeps({ resolvedTenantId: 'tenant-a' });
    const depsB = makeDeps({ resolvedTenantId: 'tenant-b' });

    await makeService(depsA).handleNotification(baseInput({ storeId: '111' }));
    await makeService(depsB).handleNotification(baseInput({ storeId: '222', orderId: '555' }));

    expect(depsA.tx.tiendanubeOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId_tiendanubeOrderId: { tenantId: 'tenant-a', tiendanubeOrderId: '555' } } }),
    );
    expect(depsB.tx.tiendanubeOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId_tiendanubeOrderId: { tenantId: 'tenant-b', tiendanubeOrderId: '555' } } }),
    );
  });
});

describe('TiendanubeWebhookService.handleNotification - idempotency', () => {
  it('the same order notified twice creates exactly one TiendanubeOrder (second delivery is a no-op)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput());
    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledTimes(1);
    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);

    // Second delivery of the SAME notification: findUnique now returns the
    // row this same test just "created", already processed=true.
    (deps.prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({ id: 'event-1', tenantId: 'tenant-1', processed: true });
    await service.handleNotification(baseInput());

    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledTimes(1);
    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);
  });

  it('a retry of a previously-FAILED (unprocessed) event reprocesses instead of skipping', async () => {
    const deps = makeDeps({ webhookEventExisting: { id: 'event-1', tenantId: 'tenant-1', processed: false } });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    // Must NOT re-insert (findUnique already found it) but MUST still do
    // the real work.
    expect(deps.prisma.webhookEvent.create).not.toHaveBeenCalled();
    expect(deps.apiClient.request).toHaveBeenCalledTimes(1);
    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledTimes(1);
  });

  it('never marks processed=true and rethrows when importing the order fails - Tiendanube gets a real retry', async () => {
    const deps = makeDeps();
    (deps.apiClient.request as jest.Mock).mockRejectedValue(new Error('boom'));
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput())).rejects.toThrow('boom');

    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: { error: 'boom' } }));
    expect(deps.prisma.webhookEvent.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });
});

describe('TiendanubeWebhookService.handleNotification - live order-received event (Fase 5)', () => {
  it('emits tiendanube.order-received once the TiendanubeOrder row is persisted', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.eventEmitter.emit).toHaveBeenCalledWith('tiendanube.order-received', {
      tenantId: 'tenant-1',
      tiendanubeOrderRowId: 'tn-order-1',
    });
  });

  it('never emits it when the webhook signature is invalid', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput({ signatureHeader: 'ts=1,v1=deadbeef' }))).rejects.toThrow();

    expect(deps.eventEmitter.emit).not.toHaveBeenCalled();
  });
});

describe('TiendanubeWebhookService.handleNotification - customer matching (decisión #2)', () => {
  it('matches by CUIT/taxId first, without ever looking at email or creating a company', async () => {
    const deps = makeDeps();
    deps.tx.company.findFirst.mockResolvedValueOnce({ id: 'company-by-taxid' });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.company.findFirst).toHaveBeenCalledTimes(1);
    expect(deps.tx.company.findFirst).toHaveBeenCalledWith({ where: { taxId: '20123456789' } });
    expect(deps.companiesService.createCompany).not.toHaveBeenCalled();
    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ customerId: 'company-by-taxid' }) }),
    );
  });

  it('falls back to email when taxId does not match', async () => {
    const deps = makeDeps();
    deps.tx.company.findFirst
      .mockResolvedValueOnce(null) // taxId lookup
      .mockResolvedValueOnce({ id: 'company-by-email' }); // email lookup
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.company.findFirst).toHaveBeenCalledTimes(2);
    expect(deps.tx.company.findFirst).toHaveBeenNthCalledWith(2, {
      where: { email: { equals: 'juan@example.com', mode: 'insensitive' } },
    });
    expect(deps.companiesService.createCompany).not.toHaveBeenCalled();
    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ customerId: 'company-by-email' }) }),
    );
  });

  it('creates a new company only when neither taxId nor email match anything', async () => {
    const deps = makeDeps(); // findFirst resolves null both times by default
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.companiesService.createCompany).toHaveBeenCalledWith({
      name: 'Juan Pérez',
      taxId: '20123456789',
      email: 'juan@example.com',
      roles: ['CUSTOMER'],
    });
    expect(deps.tx.tiendanubeOrder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ customerId: 'new-company-1' }) }),
    );
  });

  it('never fails on a final-consumer order with no CUIT - falls straight to email/creation instead', async () => {
    const deps = makeDeps({ order: makeOrder({ contact_identification: null }) });
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput())).resolves.toBeUndefined();

    // Only the email lookup ran - taxId lookup was skipped entirely (no
    // empty-string query against the taxId column).
    expect(deps.tx.company.findFirst).toHaveBeenCalledTimes(1);
    expect(deps.tx.company.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'juan@example.com', mode: 'insensitive' } },
    });
    expect(deps.companiesService.createCompany).toHaveBeenCalledWith(expect.objectContaining({ taxId: undefined }));
  });

  it('creates a generic "Consumidor Final" company for a guest checkout with neither CUIT nor a matched email', async () => {
    const deps = makeDeps({ order: makeOrder({ contact_identification: null, contact_name: null, contact_email: null }) });
    const service = makeService(deps);

    await expect(service.handleNotification(baseInput())).resolves.toBeUndefined();

    expect(deps.tx.company.findFirst).not.toHaveBeenCalled(); // no taxId, no email - nothing to look up
    expect(deps.companiesService.createCompany).toHaveBeenCalledWith({
      name: 'Consumidor Final (Tiendanube)',
      taxId: undefined,
      email: undefined,
      roles: ['CUSTOMER'],
    });
  });
});

describe('TiendanubeWebhookService.handleNotification - SKU mapping (decisión #3)', () => {
  it('maps every line by SKU when all match - reviewReason stays undefined', async () => {
    const deps = makeDeps({ articleVariant: { id: 'variant-1' } });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.tx.articleVariant.findUnique).toHaveBeenCalledWith({ where: { tenantId_sku: { tenantId: 'tenant-1', sku: 'ABC-123' } } });
    const call = (deps.tx.tiendanubeOrder.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.reviewReason).toBeUndefined();
    expect(call.create.lineItems).toEqual([
      { sku: 'ABC-123', name: 'Remera', quantity: 1, unitPrice: '1500.00', articleVariantId: 'variant-1' },
    ]);
  });

  it('an unknown SKU is marked in reviewReason and left unmapped - never creates an article automatically', async () => {
    const deps = makeDeps({ articleVariant: null });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    const call = (deps.tx.tiendanubeOrder.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.reviewReason).toContain('SKU sin mapear: ABC-123');
    expect(call.create.lineItems).toEqual([
      { sku: 'ABC-123', name: 'Remera', quantity: 1, unitPrice: '1500.00', articleVariantId: null },
    ]);
  });

  it('a line item with no SKU at all is counted separately from unmapped SKUs', async () => {
    const deps = makeDeps({
      order: makeOrder({
        products: [{ id: 1, product_id: null, variant_id: null, sku: null, name: 'Sin SKU', price: '10.00', quantity: 2 }],
      }),
    });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    const call = (deps.tx.tiendanubeOrder.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.reviewReason).toContain('1 línea(s) sin SKU cargado');
    expect(deps.tx.articleVariant.findUnique).not.toHaveBeenCalled();
  });
});

describe('TiendanubeWebhookService.handleNotification - regla #4 (nunca auto-convierte)', () => {
  it('even a perfectly-matched order (customer + every SKU mapped) is persisted without ever setting status - relies on the schema default PENDING_REVIEW', async () => {
    const deps = makeDeps({ articleVariant: { id: 'variant-1' } });
    deps.tx.company.findFirst.mockResolvedValueOnce({ id: 'company-by-taxid' });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    const call = (deps.tx.tiendanubeOrder.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.reviewReason).toBeUndefined();
    expect(call.create).not.toHaveProperty('status');
    // No conversion endpoint exists yet - nothing in this service ever
    // touches SalesService/InvoicingService.
  });
});

describe('TiendanubeWebhookService.handleNotification - other terminal cases', () => {
  it('acks without importing anything when the tenant has no CONNECTED Tiendanube connector', async () => {
    const deps = makeDeps({ connector: null });
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    expect(deps.apiClient.request).not.toHaveBeenCalled();
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
  });

  it('persists the full raw order payload and header fields for audit', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.handleNotification(baseInput());

    const call = (deps.tx.tiendanubeOrder.upsert as jest.Mock).mock.calls[0][0];
    expect(call.create.tiendanubeOrderId).toBe('555');
    expect(call.create.tiendanubeOrderNumber).toBe(42);
    expect(call.create.tiendanubeStoreId).toBe('999');
    expect(call.create.currency).toBe('ARS');
    expect(call.create.total.toString()).toBe('1500');
    expect(call.create.rawPayload).toEqual(makeOrder());
  });
});

describe('TiendanubeWebhookService.handleNotification - app/uninstalled', () => {
  function uninstallInput(overrides: Partial<TiendanubeWebhookInput> = {}): TiendanubeWebhookInput {
    return baseInput({
      event: 'app/uninstalled',
      orderId: undefined,
      payload: { store_id: 999, event: 'app/uninstalled' },
      rawBody: Buffer.from(JSON.stringify({ store_id: 999, event: 'app/uninstalled' })),
      ...overrides,
    });
  }

  it('revokes the connector and clears its secrets when the store uninstalls the app', async () => {
    const deps = makeDeps({ resolvedTenantId: 'tenant-1' });
    const service = makeService(deps);

    await service.handleNotification(uninstallInput());

    expect(deps.connectorService.clearSecrets).toHaveBeenCalledWith('connector-1');
    expect(deps.connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'REVOKED',
      expect.stringContaining('desinstaló'),
    );
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ processed: true }) }),
    );
    // Nunca toca el camino de importación de órdenes.
    expect(deps.apiClient.request).not.toHaveBeenCalled();
  });

  it('is a clean no-op (still marked processed, no error) when there is no CONNECTED connector to revoke', async () => {
    const deps = makeDeps({ resolvedTenantId: null });
    const service = makeService(deps);

    await service.handleNotification(uninstallInput());

    expect(deps.connectorService.clearSecrets).not.toHaveBeenCalled();
    expect(deps.prisma.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { processed: true, processedAt: expect.any(Date) } }),
    );
  });

  it('the same uninstall notification delivered twice only revokes once (idempotent)', async () => {
    const deps = makeDeps({ resolvedTenantId: 'tenant-1' });
    const service = makeService(deps);

    await service.handleNotification(uninstallInput());
    expect(deps.connectorService.clearSecrets).toHaveBeenCalledTimes(1);

    (deps.prisma.webhookEvent.findUnique as jest.Mock).mockResolvedValue({
      id: 'event-1',
      tenantId: 'tenant-1',
      processed: true,
    });
    await service.handleNotification(uninstallInput());

    expect(deps.connectorService.clearSecrets).toHaveBeenCalledTimes(1);
  });

  it('is never re-attempted once an already-REVOKED connector is found - no-op, not an error', async () => {
    const deps = makeDeps({ resolvedTenantId: 'tenant-1', connector: { id: 'connector-1', status: 'REVOKED' } });
    const service = makeService(deps);

    await service.handleNotification(uninstallInput());

    expect(deps.connectorService.clearSecrets).not.toHaveBeenCalled();
    expect(deps.connectorService.setStatus).not.toHaveBeenCalled();
  });
});
