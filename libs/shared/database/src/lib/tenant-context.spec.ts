import { getTenantDb, getTenantId, getUserRole, tenantContextStorage } from './tenant-context.js';

describe('tenant-context', () => {
  it('throws when no tenant context is active', () => {
    expect(() => getTenantId()).toThrow(/No tenant context active/);
    expect(() => getTenantDb()).toThrow(/No tenant context active/);
  });

  it('resolves tenantId and tx inside an active context', () => {
    const fakeTx = {} as never;
    tenantContextStorage.run({ tenantId: 'tenant-123', tx: fakeTx }, () => {
      expect(getTenantId()).toBe('tenant-123');
      expect(getTenantDb()).toBe(fakeTx);
    });
  });

  it('resolves the acting user role when present, undefined otherwise', () => {
    const fakeTx = {} as never;
    tenantContextStorage.run({ tenantId: 'tenant-123', role: 'ACCOUNTANT', tx: fakeTx }, () => {
      expect(getUserRole()).toBe('ACCOUNTANT');
    });
    tenantContextStorage.run({ tenantId: 'tenant-123', tx: fakeTx }, () => {
      expect(getUserRole()).toBeUndefined();
    });
  });
});
