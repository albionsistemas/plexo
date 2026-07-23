import { tenantContextStorage } from '@plexo/database';
import { ActivityLogService } from './activity-log.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ActivityLogService.listForUser', () => {
  it('phrases a decorated updated-company row as a friendly sentence', async () => {
    const db = {
      userActivityLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-1',
            action: 'company.updated',
            entityType: 'company',
            entityLabel: 'Acme S.A.',
            outcome: 'SUCCESS',
            createdAt: new Date('2026-05-15T17:13:00.000Z'),
          },
        ]),
      },
    };
    const service = new ActivityLogService();

    const result = await runInTenant(db, () => service.listForUser('user-1'));

    expect(db.userActivityLog.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(result).toEqual([
      { id: 'log-1', action: 'Editaste Empresa Acme S.A.', occurredAt: new Date('2026-05-15T17:13:00.000Z') },
    ]);
  });

  it('phrases created/deleted verbs and the tenantSettings singleton (no label)', async () => {
    const db = {
      userActivityLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-2',
            action: 'person.created',
            entityType: 'person',
            entityLabel: 'Juan Pérez',
            outcome: 'SUCCESS',
            createdAt: new Date(),
          },
          {
            id: 'log-3',
            action: 'tenantSettings.updated',
            entityType: 'tenantSettings',
            entityLabel: null,
            outcome: 'SUCCESS',
            createdAt: new Date(),
          },
        ]),
      },
    };
    const service = new ActivityLogService();

    const result = await runInTenant(db, () => service.listForUser('user-1'));

    expect(result[0].action).toBe('Creaste Contacto Juan Pérez');
    expect(result[1].action).toBe('Editaste la configuración del tenant');
  });

  it('falls back to a method-derived phrase for undecorated rows, and special-cases login', async () => {
    const db = {
      userActivityLog: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'log-4', action: 'PATCH /companies/abc', entityType: null, entityLabel: null, outcome: 'SUCCESS', createdAt: new Date() },
          { id: 'log-5', action: 'auth.login', entityType: null, entityLabel: null, outcome: 'SUCCESS', createdAt: new Date() },
        ]),
      },
    };
    const service = new ActivityLogService();

    const result = await runInTenant(db, () => service.listForUser('user-1'));

    expect(result[0].action).toBe('Actualizaste algo');
    expect(result[1].action).toBe('Iniciaste sesión');
  });

  it('suffixes FAILURE rows', async () => {
    const db = {
      userActivityLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'log-6',
            action: 'company.updated',
            entityType: 'company',
            entityLabel: 'Acme S.A.',
            outcome: 'FAILURE',
            createdAt: new Date(),
          },
        ]),
      },
    };
    const service = new ActivityLogService();

    const result = await runInTenant(db, () => service.listForUser('user-1'));

    expect(result[0].action).toBe('Editaste Empresa Acme S.A. (no se pudo completar)');
  });
});

describe('ActivityLogService.listForTenant', () => {
  it('paginates, filters, and joins user name/email', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'log-1',
        action: 'company.updated',
        entityType: 'company',
        entityId: 'c-1',
        entityLabel: 'Acme S.A.',
        changes: { taxId: { from: '20-1', to: '20-2' } },
        ip: '190.1.2.3',
        outcome: 'SUCCESS',
        errorMessage: null,
        userId: 'user-1',
        createdAt: new Date('2026-05-15T17:13:00.000Z'),
      },
    ]);
    const userFindMany = jest.fn().mockResolvedValue([{ id: 'user-1', name: 'Juan Pérez', email: 'juan@demo.plexo' }]);
    const db = {
      userActivityLog: { findMany },
      user: { findMany: userFindMany },
    };
    const service = new ActivityLogService();

    const result = await runInTenant(db, () =>
      service.listForTenant({ page: 2, pageSize: 10, userId: 'user-1', entityType: 'company' }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', userId: 'user-1', entityType: 'company' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(userFindMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      select: { id: true, name: true, email: true },
    });
    expect(result).toEqual({
      page: 2,
      pageSize: 10,
      items: [
        {
          id: 'log-1',
          occurredAt: new Date('2026-05-15T17:13:00.000Z'),
          userId: 'user-1',
          userName: 'Juan Pérez',
          userEmail: 'juan@demo.plexo',
          entityType: 'company',
          entityTypeLabel: 'Empresa',
          entityId: 'c-1',
          entityLabel: 'Acme S.A.',
          changes: { taxId: { from: '20-1', to: '20-2' } },
          ip: '190.1.2.3',
          outcome: 'SUCCESS',
          errorMessage: null,
        },
      ],
    });
  });

  it('skips the user lookup entirely when no rows have a userId', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const userFindMany = jest.fn();
    const db = { userActivityLog: { findMany }, user: { findMany: userFindMany } };
    const service = new ActivityLogService();

    await runInTenant(db, () => service.listForTenant({ page: 1, pageSize: 50 }));

    expect(userFindMany).not.toHaveBeenCalled();
  });
});
