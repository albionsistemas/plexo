import { randomUUID } from 'node:crypto';
import { appPool, asTenant, insertRow } from './rls-test-client.js';
import { cleanupTenantGraph, seedTenantGraph, type TenantFixture } from './rls-fixtures.js';

/**
 * Vector 3: cross-tenant UPDATE/DELETE. An UPDATE or DELETE that targets an
 * id belonging to another tenant must not raise an error and must not
 * affect any row - RLS's `USING` clause makes the target row simply
 * invisible to the WHERE clause, so the statement matches zero rows
 * (rowCount === 0), same as if the id didn't exist at all. This is the
 * vector an app-layer bug is most likely to produce silently: a
 * service method that takes an `:id` from the route without re-checking it
 * belongs to the caller's tenant relies entirely on this DB-level
 * guarantee to fail safe.
 */
describe('RLS cross-tenant UPDATE/DELETE isolation', () => {
  let tenantAId: string;
  let tenantBId: string;
  let fixtureA: TenantFixture;

  beforeAll(async () => {
    tenantAId = randomUUID();
    tenantBId = randomUUID();
    fixtureA = await asTenant(tenantAId, async (client) => {
      await insertRow(client, 'tenants', tenantAId, { name: 'RLS Test Tenant A' });
      return seedTenantGraph(client, tenantAId, 'A');
    });
    await asTenant(tenantBId, async (client) => {
      await insertRow(client, 'tenants', tenantBId, { name: 'RLS Test Tenant B' });
    });
  });

  afterAll(async () => {
    await cleanupTenantGraph(tenantAId);
    await cleanupTenantGraph(tenantBId);
    await appPool.end();
  });

  it('an UPDATE from tenant B targeting tenant A\'s company id affects zero rows and leaves it unchanged', async () => {
    const companyId = fixtureA.ids.companyId;

    const updateResult = await asTenant(tenantBId, (client) =>
      client.query(`UPDATE companies SET name = 'HACKED BY TENANT B' WHERE id = $1`, [companyId]),
    );
    expect(updateResult.rowCount).toBe(0);

    const stillIntact = await asTenant(tenantAId, (client) =>
      client.query<{ name: string }>(`SELECT name FROM companies WHERE id = $1`, [companyId]),
    );
    expect(stillIntact.rows).toHaveLength(1);
    expect(stillIntact.rows[0]?.name).not.toBe('HACKED BY TENANT B');
  });

  it('an UPDATE from tenant B targeting tenant A\'s purchase invoice balanceDue affects zero rows', async () => {
    const purchaseInvoiceId = fixtureA.ids.purchaseInvoiceId;

    const updateResult = await asTenant(tenantBId, (client) =>
      client.query(`UPDATE purchase_invoices SET "balanceDue" = 0, status = 'PAID' WHERE id = $1`, [
        purchaseInvoiceId,
      ]),
    );
    expect(updateResult.rowCount).toBe(0);

    const stillIntact = await asTenant(tenantAId, (client) =>
      client.query<{ status: string }>(`SELECT status FROM purchase_invoices WHERE id = $1`, [purchaseInvoiceId]),
    );
    expect(stillIntact.rows[0]?.status).not.toBe('PAID');
  });

  it('a DELETE from tenant B targeting tenant A\'s purchase credit note affects zero rows and it still exists', async () => {
    const purchaseCreditNoteId = fixtureA.ids.purchaseCreditNoteId;

    const deleteResult = await asTenant(tenantBId, (client) =>
      client.query(`DELETE FROM purchase_credit_notes WHERE id = $1`, [purchaseCreditNoteId]),
    );
    expect(deleteResult.rowCount).toBe(0);

    const stillExists = await asTenant(tenantAId, (client) =>
      client.query(`SELECT id FROM purchase_credit_notes WHERE id = $1`, [purchaseCreditNoteId]),
    );
    expect(stillExists.rows).toHaveLength(1);
  });

  it('a DELETE from tenant B targeting tenant A\'s user affects zero rows and it still exists', async () => {
    const userId = fixtureA.ids.userId;

    const deleteResult = await asTenant(tenantBId, (client) =>
      client.query(`DELETE FROM users WHERE id = $1`, [userId]),
    );
    expect(deleteResult.rowCount).toBe(0);

    const stillExists = await asTenant(tenantAId, (client) =>
      client.query(`SELECT id FROM users WHERE id = $1`, [userId]),
    );
    expect(stillExists.rows).toHaveLength(1);
  });
});
