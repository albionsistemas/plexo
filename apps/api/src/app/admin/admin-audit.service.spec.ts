import type { PrismaService } from '@plexo/database';
import { AdminAuditService } from './admin-audit.service.js';

function makePrisma(tenantIds: string[], rowsByTenant: Record<string, unknown[]>) {
  const fakeTx = {
    tenant: {
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve({ id: where.id, name: `Tenant ${where.id}` }),
      ),
    },
    userActivityLog: {
      findMany: jest.fn(),
    },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };

  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(tenantIds.map((id) => ({ id }))),
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => {
      // withTenantContext doesn't tell us which tenant we're in, so track it
      // via tenantContextStorage the way getTenantId() would - simplest is
      // to have the test set current tenant before each iteration, but since
      // $transaction is invoked once per withTenantContext call (one per
      // tenant, sequential await in the service loop), we can just pop rows
      // off a queue keyed by call order matching tenantIds order.
      return cb(fakeTx);
    }),
  } as unknown as PrismaService;

  let callIndex = 0;
  fakeTx.userActivityLog.findMany.mockImplementation(() => {
    const tenantId = tenantIds[callIndex];
    callIndex += 1;
    return Promise.resolve(rowsByTenant[tenantId] ?? []);
  });

  return { prisma, fakeTx };
}

describe('AdminAuditService.listActivity', () => {
  it('merges and sorts rows from every tenant by most recent first', async () => {
    const { prisma } = makePrisma(['tenant-1', 'tenant-2'], {
      'tenant-1': [
        { id: 'log-1', createdAt: new Date('2026-08-01T10:00:00Z'), userId: null, action: 'a', entityType: null, entityId: null, entityLabel: null, ip: null, outcome: 'SUCCESS', errorMessage: null },
      ],
      'tenant-2': [
        { id: 'log-2', createdAt: new Date('2026-08-02T10:00:00Z'), userId: null, action: 'b', entityType: null, entityId: null, entityLabel: null, ip: null, outcome: 'SUCCESS', errorMessage: null },
      ],
    });
    const service = new AdminAuditService(prisma);

    const result = await service.listActivity({ page: 1, pageSize: 10 });

    expect(result.items.map((i) => i.id)).toEqual(['log-2', 'log-1']);
    expect(result.items[0].tenantId).toBe('tenant-2');
    expect(result.hasMore).toBe(false);
  });

  it('only queries the requested tenant when tenantId is provided', async () => {
    const { prisma, fakeTx } = makePrisma(['tenant-1', 'tenant-2'], {
      'tenant-1': [],
      'tenant-2': [],
    });
    const service = new AdminAuditService(prisma);

    await service.listActivity({ page: 1, pageSize: 10, tenantId: 'tenant-2' });

    expect(fakeTx.tenant.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(fakeTx.tenant.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: 'tenant-2' } });
  });

  it('skips a tenant whose fetch fails instead of aborting the whole page', async () => {
    const tenantIds = ['tenant-1', 'tenant-2'];
    const fakeTx = {
      tenant: {
        findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
          Promise.resolve({ id: where.id, name: `Tenant ${where.id}` }),
        ),
      },
      userActivityLog: { findMany: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    fakeTx.userActivityLog.findMany
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([
        { id: 'log-2', createdAt: new Date(), userId: null, action: 'b', entityType: null, entityId: null, entityLabel: null, ip: null, outcome: 'SUCCESS', errorMessage: null },
      ]);
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue(tenantIds.map((id) => ({ id }))),
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
    const service = new AdminAuditService(prisma);

    const result = await service.listActivity({ page: 1, pageSize: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('log-2');
  });
});
