import { JwtService } from '@nestjs/jwt';
import type { ConnectorService } from '@plexo/connectors';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import type { FastifyReply } from 'fastify';
import { TiendanubeController } from './tiendanube.controller.js';
import { TiendanubeStateService } from './tiendanube-state.service.js';
import type { TiendanubeConnector } from './tiendanube.connector.js';

function makeStateService(): TiendanubeStateService {
  return new TiendanubeStateService(new JwtService({ secret: 'test-secret' }));
}

function makeConnectorMock(overrides: Partial<jest.Mocked<TiendanubeConnector>> = {}) {
  return {
    getAuthorizationUrl: jest.fn().mockReturnValue('https://www.tiendanube.com/apps/123/authorize?state=...'),
    handleOAuthCallback: jest.fn().mockResolvedValue(undefined),
    refreshIfNeeded: jest.fn(),
    getValidAccessToken: jest.fn(),
    disconnect: jest.fn().mockResolvedValue(undefined),
    provider: 'TIENDANUBE',
    ...overrides,
  } as unknown as jest.Mocked<TiendanubeConnector>;
}

function makeConnectorServiceMock(overrides: Partial<jest.Mocked<ConnectorService>> = {}) {
  return {
    getConnector: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ConnectorService>;
}

/** $transaction just runs the callback against a stub tx - same pattern as
 * MercadoPagoController.spec (withTenantContext's own machinery is already
 * covered by tenant-context.spec.ts, not re-tested here). */
function makePrisma(): PrismaService {
  const fakeTx = { $executeRaw: jest.fn().mockResolvedValue(undefined) };
  return { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)) } as unknown as PrismaService;
}

function makeReply(): jest.Mocked<FastifyReply> {
  return { redirect: jest.fn() } as unknown as jest.Mocked<FastifyReply>;
}

function runAsUser<T>(fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', role: 'OWNER', tx: {} as never }, fn);
}

describe('TiendanubeController.authorize', () => {
  it('signs a fresh state and returns the URL the connector builds from it', () => {
    const connector = makeConnectorMock();
    const controller = new TiendanubeController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());

    const result = runAsUser(() => controller.authorize());

    expect(result).toEqual({ authorizationUrl: 'https://www.tiendanube.com/apps/123/authorize?state=...' });
    expect(connector.getAuthorizationUrl).toHaveBeenCalledWith('tenant-1', expect.any(String));
  });
});

describe('TiendanubeController.callback', () => {
  it('rejects a callback missing code/state - redirects to the error page without touching the connector', async () => {
    const connector = makeConnectorMock();
    const controller = new TiendanubeController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());
    const reply = makeReply();

    await controller.callback({}, reply);

    expect(connector.handleOAuthCallback).not.toHaveBeenCalled();
    expect(reply.redirect).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:4200/preferences?connector=tiendanube&status=error'),
      302,
    );
  });

  it('rejects an invalid/forged state - redirects to the error page without touching the connector', async () => {
    const connector = makeConnectorMock();
    const controller = new TiendanubeController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());
    const reply = makeReply();

    await controller.callback({ code: 'some-code', state: 'not-a-real-token' }, reply);

    expect(connector.handleOAuthCallback).not.toHaveBeenCalled();
    expect(reply.redirect).toHaveBeenCalledWith(expect.stringContaining('status=error'), 302);
  });

  it('opens tenant context for the tenantId carried in state, delegates to the connector, redirects to "connected"', async () => {
    const stateService = makeStateService();
    const state = stateService.sign({ tenantId: 'tenant-9', userId: 'user-9' });
    const connector = makeConnectorMock();
    const prisma = makePrisma();
    const controller = new TiendanubeController(connector, makeConnectorServiceMock(), stateService, prisma);
    const reply = makeReply();

    await controller.callback({ code: 'auth-code', state }, reply);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(connector.handleOAuthCallback).toHaveBeenCalledWith('tenant-9', 'auth-code', state);
    expect(reply.redirect).toHaveBeenCalledWith(expect.stringContaining('status=connected'), 302);
  });

  it('redirects to the error page (without leaking the internal failure) when the connector throws', async () => {
    const stateService = makeStateService();
    const state = stateService.sign({ tenantId: 'tenant-1', userId: 'user-1' });
    const connector = makeConnectorMock({
      handleOAuthCallback: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const controller = new TiendanubeController(connector, makeConnectorServiceMock(), stateService, makePrisma());
    const reply = makeReply();

    await controller.callback({ code: 'auth-code', state }, reply);

    expect(reply.redirect).toHaveBeenCalledWith(expect.stringContaining('status=error'), 302);
  });
});

describe('TiendanubeController.disconnect', () => {
  it('delegates to the connector for the current tenant', async () => {
    const connector = makeConnectorMock();
    const controller = new TiendanubeController(connector, makeConnectorServiceMock(), makeStateService(), makePrisma());

    const result = await runAsUser(() => controller.disconnect());

    expect(connector.disconnect).toHaveBeenCalledWith('tenant-1');
    expect(result).toEqual({ status: 'DISCONNECTED' });
  });
});

describe('TiendanubeController.status', () => {
  it('reports DISCONNECTED when this tenant never started connecting', async () => {
    const connectorService = makeConnectorServiceMock({ getConnector: jest.fn().mockResolvedValue(null) });
    const controller = new TiendanubeController(makeConnectorMock(), connectorService, makeStateService(), makePrisma());

    const result = await runAsUser(() => controller.status());

    expect(result).toEqual({ status: 'DISCONNECTED', storeName: null, storeId: null, connectedAt: null });
  });

  it('reports the stored status/store name/store id/connectedAt when a connector exists', async () => {
    const connectedAt = new Date('2026-08-31');
    const connectorService = makeConnectorServiceMock({
      getConnector: jest.fn().mockResolvedValue({
        status: 'CONNECTED',
        externalNickname: 'Mi Tienda',
        externalAccountId: '654321',
        connectedAt,
      }),
    });
    const controller = new TiendanubeController(makeConnectorMock(), connectorService, makeStateService(), makePrisma());

    const result = await runAsUser(() => controller.status());

    expect(result).toEqual({ status: 'CONNECTED', storeName: 'Mi Tienda', storeId: '654321', connectedAt });
  });
});
