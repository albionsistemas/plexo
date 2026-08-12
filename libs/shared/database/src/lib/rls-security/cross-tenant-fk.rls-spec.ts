import { randomUUID } from 'node:crypto';
import { appPool, asTenant, insertRow, newId } from './rls-test-client.js';
import { cleanupTenantGraph, seedTenantGraph, type TenantFixture } from './rls-fixtures.js';

/**
 * Vector 5: cross-tenant FK, using the PurchaseCreditNote module. Under a
 * session correctly scoped to tenant A (own tenantId, own supplier/
 * currency/user - only `purchaseInvoiceId` names a row that belongs to
 * tenant B), try to INSERT a purchase_credit_notes row referencing tenant
 * B's PurchaseInvoice directly (bypassing PurchaseCreditNoteService, which
 * normally re-fetches the invoice under RLS via `findUnique` and 404s
 * before ever reaching this INSERT - see purchase-credit-note.service.ts).
 * This test is specifically about whether the DATABASE, on its own, closes
 * this off - not whether the app's service layer happens to check first.
 *
 * Important, and worth calling out explicitly: PostgreSQL's own
 * documentation states that referential integrity (FOREIGN KEY) checks
 * bypass row security - they have to, structurally, since a FK check has
 * to be able to confirm a referenced row still EXISTS regardless of which
 * role's RLS-filtered view is currently active, or dropping a referenced
 * row while a different role can't see it would silently corrupt
 * referential integrity for everyone. That means `purchaseInvoiceId`
 * pointing at another tenant's row is a case standard FK enforcement was
 * never going to catch - the tenantId column on the row you're creating is
 * closed off by WITH CHECK (vector 2), but a FOREIGN KEY to a DIFFERENT
 * table is a different mechanism with a different, narrower guarantee
 * (existence, not tenant match).
 */
describe('RLS cross-tenant FK: PurchaseCreditNote -> PurchaseInvoice of another tenant', () => {
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

  it('cannot create a PurchaseCreditNote in tenant A pointing at a PurchaseInvoice owned by tenant B', async () => {
    await expect(
      asTenant(tenantAId, (client) =>
        insertRow(client, 'purchase_credit_notes', newId(), {
          tenantId: tenantAId, // correct - satisfies this row's own WITH CHECK
          purchaseInvoiceId: fixtureB.ids.purchaseInvoiceId, // belongs to tenant B
          supplierId: fixtureA.ids.companyId,
          supplierName: 'Cross-tenant FK probe',
          supplierCreditNoteNumber: 'PROBE-FK-1',
          supplierCreditNoteDate: new Date(),
          reason: 'RLS cross-tenant FK probe',
          currencyId: fixtureA.ids.currencyId,
          subtotal: 1,
          taxTotal: 0,
          total: 1,
          createdByUserId: fixtureA.ids.userId,
        }),
      ),
    ).rejects.toThrow();
  });
});
