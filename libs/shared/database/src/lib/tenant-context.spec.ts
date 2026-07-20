import { getTenantDb, getTenantId, tenantContextStorage } from './tenant-context.js';

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
});
