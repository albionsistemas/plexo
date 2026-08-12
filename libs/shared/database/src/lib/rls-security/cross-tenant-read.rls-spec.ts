import { randomUUID } from 'node:crypto';
import { appPool, asTenant, insertRow } from './rls-test-client.js';
import { cleanupTenantGraph, seedTenantGraph, type TenantFixture } from './rls-fixtures.js';

/**
 * Vector 1: cross-tenant READ. Seeds a full, realistic business graph for
 * two independent tenants (A and B - dozens of tables, including the
 * PurchaseCreditNote chain from the module just built), then actively
 * tries to read tenant B's rows while the session is scoped to tenant A
 * (and vice versa). The only thing that should ever make these queries
 * come back empty is the `USING (tenantId = current_setting('app.tenant_id'))`
 * clause on each table's RLS policy - there is no `WHERE tenantId = ...`
 * anywhere in these queries, on purpose.
 */
describe('RLS cross-tenant read isolation', () => {
  let tenantAId: string;
  let tenantBId: string;
  let fixtureA: TenantFixture;
  let fixtureB: TenantFixture;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    fixtureA = await asTenant(tenantAId, async (client) => {
      await insertRow(client, 'tenants', tenantAId, { name: 'RLS Test Tenant A' });
      return seedTenantGraph(client, tenantAId, 'A');
    });
    fixtureB = await asTenant(tenantBId, async (client) => {
      await insertRow(client, 'tenants', tenantBId, { name: 'RLS Test Tenant B' });
      return seedTenantGraph(client, tenantBId, 'B');
    });
  });

  afterAll(async () => {
    await cleanupTenantGraph(tenantAId);
    await cleanupTenantGraph(tenantBId);
    await appPool.end();
  });

  it('seeded real rows across a large, matching set of tenant-scoped tables for both tenants', () => {
    const tablesA = Object.keys(fixtureA.idsByTable).sort();
    const tablesB = Object.keys(fixtureB.idsByTable).sort();
    expect(tablesA).toEqual(tablesB);
    // Sanity floor, same reasoning as the structural test's own floor -
    // guards against this fixture silently seeding nothing.
    expect(tablesA.length).toBeGreaterThan(30);
  });

  it('tenant A cannot fetch tenant B rows by id, in any seeded table (and vice versa)', async () => {
    const leaks: string[] = [];

    for (const [table, bIds] of Object.entries(fixtureB.idsByTable)) {
      if (bIds.length === 0) continue;
      await asTenant(tenantAId, async (client) => {
        const { rows } = await client.query(`SELECT id FROM "${table}" WHERE id = ANY($1)`, [bIds]);
        if (rows.length > 0) {
          leaks.push(`${table}: tenant A's session read ${rows.length} row(s) that belong to tenant B`);
        }
      });
    }

    for (const [table, aIds] of Object.entries(fixtureA.idsByTable)) {
      if (aIds.length === 0) continue;
      await asTenant(tenantBId, async (client) => {
        const { rows } = await client.query(`SELECT id FROM "${table}" WHERE id = ANY($1)`, [aIds]);
        if (rows.length > 0) {
          leaks.push(`${table}: tenant B's session read ${rows.length} row(s) that belong to tenant A`);
        }
      });
    }

    expect(leaks).toEqual([]);
  });

  it('an unfiltered SELECT under tenant A never returns a row with a foreign tenantId (and vice versa)', async () => {
    const leaks: string[] = [];

    await asTenant(tenantAId, async (client) => {
      for (const table of Object.keys(fixtureA.idsByTable)) {
        const { rows } = await client.query<{ tenantId: string }>(`SELECT "tenantId" FROM "${table}"`);
        const foreign = rows.filter((r) => r.tenantId !== tenantAId);
        if (foreign.length > 0) {
          leaks.push(`${table}: ${foreign.length} row(s) with a foreign tenantId visible under tenant A`);
        }
      }
    });

    await asTenant(tenantBId, async (client) => {
      for (const table of Object.keys(fixtureB.idsByTable)) {
        const { rows } = await client.query<{ tenantId: string }>(`SELECT "tenantId" FROM "${table}"`);
        const foreign = rows.filter((r) => r.tenantId !== tenantBId);
        if (foreign.length > 0) {
          leaks.push(`${table}: ${foreign.length} row(s) with a foreign tenantId visible under tenant B`);
        }
      }
    });

    expect(leaks).toEqual([]);
  });
});
