import { tenantContextStorage } from '@plexo/database';
import type { SubscriptionService } from '@plexo/subscriptions';
import { UsersService } from './users.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('UsersService.inviteUser', () => {
  it('checks the quota before creating the user, and returns a temp password not the hash', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'user-2', email: 'nuevo@acme.com' });
    const db = { user: { create } };
    const subscriptionService = { assertCanAddUser: jest.fn().mockResolvedValue(undefined) } as unknown as SubscriptionService;
    const service = new UsersService(subscriptionService);

    const result = await runInTenant(db, () =>
      service.inviteUser({ email: 'nuevo@acme.com', role: 'SALES' }),
    );

    expect(subscriptionService.assertCanAddUser).toHaveBeenCalled();
    const args = create.mock.calls[0][0].data;
    expect(args.tenantId).toBe('tenant-1');
    expect(args.email).toBe('nuevo@acme.com');
    expect(args.role).toBe('SALES');
    expect(args.mustChangePassword).toBe(true);
    expect(args.passwordHash).not.toBe(result.tempPassword);
    expect(result).toEqual({ id: 'user-2', email: 'nuevo@acme.com', tempPassword: expect.any(String) });
  });

  it('propagates the quota rejection without creating the user', async () => {
    const create = jest.fn();
    const db = { user: { create } };
    const failure = new Error('Alcanzaste el límite de usuarios de tu plan actual (Basic Gratis: 1)');
    const subscriptionService = {
      assertCanAddUser: jest.fn().mockRejectedValue(failure),
    } as unknown as SubscriptionService;
    const service = new UsersService(subscriptionService);

    await expect(
      runInTenant(db, () => service.inviteUser({ email: 'otro@acme.com', role: 'VIEWER' })),
    ).rejects.toThrow(failure);
    expect(create).not.toHaveBeenCalled();
  });
});
