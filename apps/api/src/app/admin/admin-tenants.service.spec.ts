import type { PrismaService } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import { AdminTenantsService } from './admin-tenants.service.js';

function makePrisma() {
  const fakeTx = {
    tenant: { create: jest.fn().mockResolvedValue({}) },
    user: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
  } as unknown as PrismaService;
  return { prisma, fakeTx };
}

describe('AdminTenantsService.createTenant', () => {
  it('creates the tenant and its first OWNER user with a temporary password that must be changed', async () => {
    const { prisma, fakeTx } = makePrisma();
    const subscriptionService = { startTrial: jest.fn().mockResolvedValue({}) } as unknown as SubscriptionService;
    const service = new AdminTenantsService(prisma, subscriptionService);

    const result = await service.createTenant({
      name: 'Nueva Empresa SA',
      ownerEmail: 'owner@nueva.com',
      planKey: 'BASIC',
    });

    expect(fakeTx.tenant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: result.tenantId, name: 'Nueva Empresa SA' }),
    });
    const userArgs = fakeTx.user.create.mock.calls[0][0].data;
    expect(userArgs.tenantId).toBe(result.tenantId);
    expect(userArgs.email).toBe('owner@nueva.com');
    expect(userArgs.role).toBe('OWNER');
    expect(userArgs.mustChangePassword).toBe(true);
    expect(userArgs.passwordHash).not.toBe(result.tempPassword); // hashed, not plaintext

    expect(subscriptionService.startTrial).toHaveBeenCalledWith('BASIC');
    expect(result).toEqual({
      tenantId: expect.any(String),
      ownerEmail: 'owner@nueva.com',
      tempPassword: expect.any(String),
    });
  });

  it('starts the trial only after the tenant and owner user are created', async () => {
    const { prisma, fakeTx } = makePrisma();
    const callOrder: string[] = [];
    fakeTx.tenant.create.mockImplementation(() => {
      callOrder.push('tenant');
      return Promise.resolve({});
    });
    fakeTx.user.create.mockImplementation(() => {
      callOrder.push('user');
      return Promise.resolve({});
    });
    const subscriptionService = {
      startTrial: jest.fn().mockImplementation(() => {
        callOrder.push('trial');
        return Promise.resolve({});
      }),
    } as unknown as SubscriptionService;
    const service = new AdminTenantsService(prisma, subscriptionService);

    await service.createTenant({ name: 'Acme', ownerEmail: 'o@acme.com', planKey: 'GOLD' });

    expect(callOrder).toEqual(['tenant', 'user', 'trial']);
  });
});
