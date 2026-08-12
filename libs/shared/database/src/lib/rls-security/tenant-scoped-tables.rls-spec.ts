import { appPool, getRlsState, getTenantScopedTables } from './rls-test-client.js';

/**
 * The backstop this whole suite exists for: if someone adds a new
 * tenant-scoped table (a model with a required `tenantId` column) in a
 * future migration and forgets the RLS/policy/GRANT block that every other
 * one of them has, THIS test is what turns that into a red CI run instead
 * of a silent data leak found in production. See rls-test-client.ts's
 * getTenantScopedTables() doc comment for exactly how "tenant-scoped" is
 * derived (live from Postgres, not a hand-maintained list) and why `plans`
 * and `tenants` are structurally excluded rather than skip-listed.
 */
describe('RLS structural check: every tenant-scoped table', () => {
  afterAll(async () => {
    await appPool.end();
  });

  it('derives a realistic, non-trivial list of tenant-scoped tables', async () => {
    const client = await appPool.connect();
    try {
      const tables = await getTenantScopedTables(client);
      // A sanity floor, not an exact count - the schema grows over time.
      // This exists so a broken information_schema query (e.g. a typo'd
      // column name) that silently returns an empty list can never make
      // every test below vacuously pass.
      expect(tables.length).toBeGreaterThan(40);
    } finally {
      client.release();
    }
  });

  it('every tenant-scoped table has RLS enabled, forced, and at least one policy', async () => {
    const client = await appPool.connect();
    try {
      const tables = await getTenantScopedTables(client);
      const states = await getRlsState(client, tables);
      const broken = states.filter(
        (s) => !s.exists || !s.rowSecurityEnabled || !s.rowSecurityForced || s.policyCount < 1,
      );
      expect(broken).toEqual([]);
    } finally {
      client.release();
    }
  });

  it('excludes `plans` - a global commercial catalog shared by every tenant, no tenantId column and no RLS by design', async () => {
    const client = await appPool.connect();
    try {
      const tables = await getTenantScopedTables(client);
      expect(tables).not.toContain('plans');
    } finally {
      client.release();
    }
  });

  it('excludes `tenants` and `system_error_log` for structural reasons, not oversight', async () => {
    const client = await appPool.connect();
    try {
      const tables = await getTenantScopedTables(client);
      // `tenants` has RLS, but keyed on its own `id` column
      // (id = current_setting('app.tenant_id')) - it IS the tenant, not a
      // child table with a tenantId column pointing at one. Exercised
      // directly in cross-tenant-fk.rls-spec.ts instead.
      expect(tables).not.toContain('tenants');
      // system_error_log.tenantId is nullable/informational (errors can
      // happen before any tenant context resolves) and deliberately has no
      // RLS - see its doc comment in schema.prisma. Confirmed here as a
      // named, understood exclusion rather than treating it as a gap.
      expect(tables).not.toContain('system_error_log');
    } finally {
      client.release();
    }
  });
});
