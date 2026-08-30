import { tenantContextStorage } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import { ConnectorService } from './connector.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeEncryption(): EncryptionService {
  process.env['ENCRYPTION_MASTER_KEY'] = '11'.repeat(32);
  return new EncryptionService();
}

describe('ConnectorService.getConnector', () => {
  it('returns null when this tenant never started connecting the provider', async () => {
    const db = { connector: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service = new ConnectorService(makeEncryption());

    const result = await runInTenant(db, () => service.getConnector('MERCADO_PAGO'));

    expect(result).toBeNull();
    expect(db.connector.findFirst).toHaveBeenCalledWith({ where: { provider: 'MERCADO_PAGO' } });
  });
});

describe('ConnectorService.getOrCreateConnector', () => {
  it('returns the existing row instead of creating a duplicate', async () => {
    const existing = { id: 'connector-1', provider: 'MERCADO_PAGO' };
    const db = {
      connector: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const service = new ConnectorService(makeEncryption());

    const result = await runInTenant(db, () => service.getOrCreateConnector('MERCADO_PAGO'));

    expect(result).toBe(existing);
    expect(db.connector.create).not.toHaveBeenCalled();
  });

  it('creates a PENDING connector scoped to the current tenant when none exists', async () => {
    const created = { id: 'connector-2', provider: 'MERCADO_PAGO' };
    const db = {
      connector: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const service = new ConnectorService(makeEncryption());

    const result = await runInTenant(db, () => service.getOrCreateConnector('MERCADO_PAGO'));

    expect(result).toBe(created);
    expect(db.connector.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', provider: 'MERCADO_PAGO' },
    });
  });
});

describe('ConnectorService.saveSecret / getSecret', () => {
  it('encrypts on save and decrypts back the same plaintext on read', async () => {
    let stored: { value: string } | undefined;
    const db = {
      connectorSecret: {
        upsert: jest.fn().mockImplementation(({ create }) => {
          stored = create;
          return Promise.resolve(create);
        }),
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(stored)),
      },
    };
    const service = new ConnectorService(makeEncryption());

    await runInTenant(db, () => service.saveSecret('connector-1', 'access_token', 'APP_USR-secret-token'));
    const result = await runInTenant(db, () => service.getSecret('connector-1', 'access_token'));

    expect(result).toBe('APP_USR-secret-token');
    expect(stored?.value).not.toContain('APP_USR-secret-token');
  });

  it('upserts keyed on (connectorId, key) so a refresh overwrites, never duplicates', async () => {
    const db = {
      connectorSecret: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new ConnectorService(makeEncryption());

    await runInTenant(db, () => service.saveSecret('connector-1', 'refresh_token', 'r1'));

    expect(db.connectorSecret.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { connectorId_key: { connectorId: 'connector-1', key: 'refresh_token' } },
      }),
    );
  });

  it('returns null when no secret is stored under that key', async () => {
    const db = { connectorSecret: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ConnectorService(makeEncryption());

    const result = await runInTenant(db, () => service.getSecret('connector-1', 'access_token'));

    expect(result).toBeNull();
  });
});

describe('ConnectorService.setStatus', () => {
  it('stamps lastErrorAt/lastErrorMessage when moving to ERROR', async () => {
    const db = { connector: { update: jest.fn().mockResolvedValue({}) } };
    const service = new ConnectorService(makeEncryption());

    await runInTenant(db, () => service.setStatus('connector-1', 'ERROR', 'invalid_grant'));

    expect(db.connector.update).toHaveBeenCalledWith({
      where: { id: 'connector-1' },
      data: {
        status: 'ERROR',
        lastErrorAt: expect.any(Date),
        lastErrorMessage: 'invalid_grant',
      },
    });
  });

  it('leaves lastErrorAt/lastErrorMessage undefined for a non-ERROR status', async () => {
    const db = { connector: { update: jest.fn().mockResolvedValue({}) } };
    const service = new ConnectorService(makeEncryption());

    await runInTenant(db, () => service.setStatus('connector-1', 'CONNECTED'));

    expect(db.connector.update).toHaveBeenCalledWith({
      where: { id: 'connector-1' },
      data: { status: 'CONNECTED', lastErrorAt: undefined, lastErrorMessage: undefined },
    });
  });
});

describe('ConnectorService.disconnect', () => {
  it('is a no-op when this tenant never connected the provider', async () => {
    const db = {
      connector: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      connectorSecret: { deleteMany: jest.fn() },
    };
    const service = new ConnectorService(makeEncryption());

    await runInTenant(db, () => service.disconnect('MERCADO_PAGO'));

    expect(db.connectorSecret.deleteMany).not.toHaveBeenCalled();
    expect(db.connector.update).not.toHaveBeenCalled();
  });

  it('deletes every secret and marks the connector DISCONNECTED', async () => {
    const db = {
      connector: {
        findFirst: jest.fn().mockResolvedValue({ id: 'connector-1', provider: 'MERCADO_PAGO' }),
        update: jest.fn().mockResolvedValue({}),
      },
      connectorSecret: { deleteMany: jest.fn().mockResolvedValue({}) },
    };
    const service = new ConnectorService(makeEncryption());

    await runInTenant(db, () => service.disconnect('MERCADO_PAGO'));

    expect(db.connectorSecret.deleteMany).toHaveBeenCalledWith({ where: { connectorId: 'connector-1' } });
    expect(db.connector.update).toHaveBeenCalledWith({
      where: { id: 'connector-1' },
      data: { status: 'DISCONNECTED' },
    });
  });
});
