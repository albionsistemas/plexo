import type { ConnectorService } from '@plexo/connectors';
import type { PrismaService } from '@plexo/database';
import type { MercadoPagoConnector } from '@plexo/mercadopago';
import { MercadoPagoRefreshSchedulerService } from './mercadopago-refresh-scheduler.service.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn((_prisma: unknown, _tenantId: string, fn: () => unknown) => fn()),
}));

const { withTenantContext } = jest.requireMock('@plexo/database') as { withTenantContext: jest.Mock };

describe('MercadoPagoRefreshSchedulerService.refreshConnectedTenants', () => {
  beforeEach(() => {
    withTenantContext.mockClear();
    withTenantContext.mockImplementation((_prisma, _tenantId, fn) => fn());
  });

  it('sweeps every tenant, refreshing only the ones with a CONNECTED Mercado Pago connector', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }, { id: 'tenant-3' }]),
    } as unknown as PrismaService;
    const connectorService = {
      getConnector: jest
        .fn()
        .mockResolvedValueOnce({ id: 'connector-1', status: 'CONNECTED' })
        .mockResolvedValueOnce(null) // tenant-2 never connected
        .mockResolvedValueOnce({ id: 'connector-3', status: 'EXPIRED' }), // tenant-3 needs reconnection
    } as unknown as ConnectorService;
    const mercadoPagoConnector = {
      getValidAccessToken: jest.fn().mockResolvedValue('token'),
    } as unknown as MercadoPagoConnector;
    const scheduler = new MercadoPagoRefreshSchedulerService(prisma, connectorService, mercadoPagoConnector);

    await scheduler.refreshConnectedTenants();

    expect(withTenantContext).toHaveBeenCalledTimes(3);
    expect(mercadoPagoConnector.getValidAccessToken).toHaveBeenCalledTimes(1);
    expect(mercadoPagoConnector.getValidAccessToken).toHaveBeenCalledWith('connector-1');
  });

  it('logs and continues when one tenant fails (e.g. a dead refresh_token), without aborting the rest of the sweep', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const connectorService = {
      getConnector: jest.fn().mockResolvedValue({ id: 'connector-1', status: 'CONNECTED' }),
    } as unknown as ConnectorService;
    const mercadoPagoConnector = {
      getValidAccessToken: jest.fn().mockRejectedValueOnce(new Error('invalid_grant')).mockResolvedValueOnce('token'),
    } as unknown as MercadoPagoConnector;
    const scheduler = new MercadoPagoRefreshSchedulerService(prisma, connectorService, mercadoPagoConnector);

    await expect(scheduler.refreshConnectedTenants()).resolves.toBeUndefined();

    expect(mercadoPagoConnector.getValidAccessToken).toHaveBeenCalledTimes(2);
  });
});
