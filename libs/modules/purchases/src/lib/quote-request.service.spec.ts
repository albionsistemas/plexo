import { Prisma, tenantContextStorage } from '@plexo/database';
import type { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import type { PurchaseNumberingService } from './purchase-numbering.service.js';
import { QuoteRequestService } from './quote-request.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeNumbering(number = 'PED-000001'): PurchaseNumberingService {
  return { nextNumber: jest.fn().mockResolvedValue(number) } as unknown as PurchaseNumberingService;
}

function makePdfGenerator(): PdfGeneratorService {
  return { generate: jest.fn() } as unknown as PdfGeneratorService;
}

function makeSupplier(overrides: Partial<{ active: boolean; roles: { role: string }[] }> = {}) {
  return {
    id: 'supplier-1',
    name: 'Distribuidora Norte',
    taxId: '20-1-1',
    email: 'compras@norte.com',
    fiscalAddress: null,
    active: overrides.active ?? true,
    roles: overrides.roles ?? [{ role: 'SUPPLIER' }],
  };
}

describe('QuoteRequestService.create', () => {
  it('computes estimatedTotal when every line has a cost, and assigns a number from the creating user', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier()) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'usd', code: 'USD' }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ id: 'variant-1' }) },
      quoteRequest: {
        create: jest.fn((args) => Promise.resolve({ id: 'qr-1', ...args.data })),
      },
    };
    const numbering = makeNumbering('PED-000042');
    const service = new QuoteRequestService(numbering, makePdfGenerator());

    const created = await runAsUser(db, () =>
      service.create({
        supplierId: 'supplier-1',
        currencyId: 'usd',
        lines: [{ articleVariantId: 'variant-1', quantity: 2, estimatedUnitCost: 10 }],
      }),
    );

    expect(numbering.nextNumber).toHaveBeenCalledWith('quoteRequest');
    expect(db.quoteRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: 'PED-000042',
          createdByUserId: 'user-1',
          estimatedTotal: expect.any(Prisma.Decimal),
        }),
      }),
    );
    expect((created as { estimatedTotal: Prisma.Decimal }).estimatedTotal.toString()).toBe('20');
  });

  it('leaves estimatedTotal null if any line is missing a cost estimate', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier()) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'usd', code: 'USD' }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ id: 'variant-1' }) },
      quoteRequest: { create: jest.fn((args) => Promise.resolve({ id: 'qr-1', ...args.data })) },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    const created = await runAsUser(db, () =>
      service.create({
        supplierId: 'supplier-1',
        currencyId: 'usd',
        lines: [{ articleVariantId: 'variant-1', quantity: 2 }],
      }),
    );

    expect((created as { estimatedTotal: unknown }).estimatedTotal).toBeNull();
  });

  it('rejects a supplier that is not flagged SUPPLIER', async () => {
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier({ roles: [{ role: 'CUSTOMER' }] })) },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    await expect(
      runAsUser(db, () =>
        service.create({ supplierId: 'supplier-1', currencyId: 'usd', lines: [{ articleVariantId: 'v', quantity: 1 }] }),
      ),
    ).rejects.toThrow('not flagged as a supplier');
  });
});

describe('QuoteRequestService.convert', () => {
  it('rejects converting a quote request that is not DRAFT', async () => {
    const db = {
      quoteRequest: {
        findUnique: jest.fn().mockResolvedValue({ id: 'qr-1', status: 'CONVERTED', lines: [] }),
      },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    await expect(runAsUser(db, () => service.convert('qr-1'))).rejects.toThrow('Only a DRAFT');
  });

  it('rejects converting when any line lacks an estimated cost', async () => {
    const db = {
      quoteRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'qr-1',
          status: 'DRAFT',
          lines: [{ estimatedUnitCost: null, quantity: 1, articleVariantId: 'v' }],
        }),
      },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    await expect(runAsUser(db, () => service.convert('qr-1'))).rejects.toThrow('estimated cost');
  });

  it('creates a PurchaseOrder from the quote request lines and marks it CONVERTED', async () => {
    const db = {
      quoteRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'qr-1',
          supplierId: 'supplier-1',
          currencyId: 'usd',
          transportModeId: null,
          paymentTermId: null,
          deliveryTimeId: null,
          notes: 'urgente',
          status: 'DRAFT',
          lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(3), estimatedUnitCost: new Prisma.Decimal(15), notes: null }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      purchaseOrder: {
        create: jest.fn((args) =>
          Promise.resolve({
            id: 'po-1',
            ...args.data,
            lines: args.data.lines.createMany.data.map(
              (l: Record<string, unknown>, i: number) => ({ id: `line-${i + 1}`, ...l }),
            ),
          }),
        ),
      },
      goodsReceiptLine: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const numbering = makeNumbering('OC-000005');
    const service = new QuoteRequestService(numbering, makePdfGenerator());

    const po = await runAsUser(db, () => service.convert('qr-1'));

    expect(numbering.nextNumber).toHaveBeenCalledWith('purchaseOrder');
    expect(db.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: 'OC-000005', quoteRequestId: 'qr-1' }),
      }),
    );
    expect((po as { total: Prisma.Decimal }).total.toString()).toBe('45');
    expect(db.quoteRequest.update).toHaveBeenCalledWith({ where: { id: 'qr-1' }, data: { status: 'CONVERTED' } });
  });
});

describe('QuoteRequestService.cancel', () => {
  it('rejects cancelling a quote request that already converted', async () => {
    const db = {
      quoteRequest: { findUnique: jest.fn().mockResolvedValue({ id: 'qr-1', status: 'CONVERTED' }) },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    await expect(runAsUser(db, () => service.cancel('qr-1'))).rejects.toThrow('Only a DRAFT');
  });
});

describe('QuoteRequestService.createGroup', () => {
  it('creates one QuoteRequest per supplier and tags all of them with a shared rfqGroupId', async () => {
    let createCount = 0;
    const created: Record<string, unknown>[] = [];
    const db = {
      company: { findUnique: jest.fn().mockResolvedValue(makeSupplier()) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'usd', code: 'USD' }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue({ id: 'variant-1' }) },
      quoteRequest: {
        create: jest.fn((args) => {
          createCount += 1;
          const row = { id: `qr-${createCount}`, ...args.data };
          created.push(row);
          return Promise.resolve(row);
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn(() => Promise.resolve(created)),
      },
    };
    const numbering = makeNumbering();
    const service = new QuoteRequestService(numbering, makePdfGenerator());

    const result = await runAsUser(db, () =>
      service.createGroup({
        supplierIds: ['supplier-1', 'supplier-2'],
        currencyId: 'usd',
        lines: [{ articleVariantId: 'variant-1', quantity: 2, estimatedUnitCost: 10 }],
      }),
    );

    expect(db.quoteRequest.create).toHaveBeenCalledTimes(2);
    expect(db.quoteRequest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['qr-1', 'qr-2'] } },
      data: { rfqGroupId: result.rfqGroupId },
    });
    expect(result.quoteRequests).toHaveLength(2);
  });
});

describe('QuoteRequestService.compareGroup', () => {
  it('pivots every quote request into one row per article, one column per supplier', async () => {
    const sharedVariant = { sku: 'SKU-1', article: { name: 'Fideos' } };
    const onlyInFirstVariant = { sku: 'SKU-2', article: { name: 'Aceite' } };
    const db = {
      quoteRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'qr-1',
            number: 'PED-1',
            status: 'DRAFT',
            estimatedTotal: new Prisma.Decimal(100),
            supplier: { id: 'supplier-1', name: 'Norte' },
            lines: [
              {
                articleVariantId: 'variant-1',
                articleVariant: sharedVariant,
                quantity: new Prisma.Decimal(2),
                estimatedUnitCost: new Prisma.Decimal(50),
              },
              {
                articleVariantId: 'variant-2',
                articleVariant: onlyInFirstVariant,
                quantity: new Prisma.Decimal(1),
                estimatedUnitCost: null,
              },
            ],
          },
          {
            id: 'qr-2',
            number: 'PED-2',
            status: 'DRAFT',
            estimatedTotal: new Prisma.Decimal(90),
            supplier: { id: 'supplier-2', name: 'Sur' },
            lines: [
              {
                articleVariantId: 'variant-1',
                articleVariant: sharedVariant,
                quantity: new Prisma.Decimal(2),
                estimatedUnitCost: new Prisma.Decimal(45),
              },
            ],
          },
        ]),
      },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    const comparison = await runAsUser(db, () => service.compareGroup('group-1'));

    expect(comparison.suppliers).toHaveLength(2);
    const sharedRow = comparison.rows.find((r) => r.articleVariantId === 'variant-1');
    expect(sharedRow?.quotes.map((q) => q.unitCost?.toString())).toEqual(['50', '45']);
    const onlyFirstRow = comparison.rows.find((r) => r.articleVariantId === 'variant-2');
    // Second supplier never quoted this article - shows up as null, not dropped.
    expect(onlyFirstRow?.quotes.find((q) => q.quoteRequestId === 'qr-2')?.unitCost).toBeNull();
  });

  it('rejects a group with no quote requests', async () => {
    const db = { quoteRequest: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    await expect(runAsUser(db, () => service.compareGroup('missing-group'))).rejects.toThrow('No quote requests');
  });
});

describe('QuoteRequestService.selectWinner', () => {
  it('converts the winner and cancels only the still-DRAFT siblings', async () => {
    const db = {
      quoteRequest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'qr-winner', status: 'DRAFT' },
          { id: 'qr-sibling-draft', status: 'DRAFT' },
          { id: 'qr-sibling-cancelled', status: 'CANCELLED' },
        ]),
        findUnique: jest.fn().mockResolvedValue({
          id: 'qr-winner',
          supplierId: 'supplier-1',
          currencyId: 'usd',
          transportModeId: null,
          paymentTermId: null,
          deliveryTimeId: null,
          notes: null,
          status: 'DRAFT',
          lines: [
            {
              articleVariantId: 'variant-1',
              quantity: new Prisma.Decimal(2),
              estimatedUnitCost: new Prisma.Decimal(50),
              notes: null,
            },
          ],
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      purchaseOrder: {
        create: jest.fn((args) =>
          Promise.resolve({
            id: 'po-1',
            ...args.data,
            lines: args.data.lines.createMany.data.map(
              (l: Record<string, unknown>, i: number) => ({ id: `line-${i + 1}`, ...l }),
            ),
          }),
        ),
      },
      goodsReceiptLine: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new QuoteRequestService(makeNumbering('OC-1'), makePdfGenerator());

    const po = await runAsUser(db, () => service.selectWinner('group-1', 'qr-winner'));

    expect((po as { id: string }).id).toBe('po-1');
    expect(db.quoteRequest.update).toHaveBeenCalledWith({ where: { id: 'qr-winner' }, data: { status: 'CONVERTED' } });
    expect(db.quoteRequest.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['qr-sibling-draft'] } },
      data: { status: 'CANCELLED' },
    });
  });

  it('rejects a winner that does not belong to the group', async () => {
    const db = {
      quoteRequest: {
        findMany: jest.fn().mockResolvedValue([{ id: 'qr-1', status: 'DRAFT' }]),
      },
    };
    const service = new QuoteRequestService(makeNumbering(), makePdfGenerator());

    await expect(runAsUser(db, () => service.selectWinner('group-1', 'qr-not-in-group'))).rejects.toThrow(
      'does not belong',
    );
  });
});

describe('QuoteRequestService.clone', () => {
  it('copies supplier/terms/lines into a new DRAFT with a fresh number', async () => {
    const db = {
      quoteRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'qr-1',
          supplierId: 'supplier-1',
          currencyId: 'usd',
          transportModeId: null,
          paymentTermId: null,
          deliveryTimeId: null,
          validUntil: null,
          notes: 'original',
          estimatedTotal: new Prisma.Decimal(20),
          lines: [{ articleVariantId: 'variant-1', quantity: 2, estimatedUnitCost: new Prisma.Decimal(10), notes: null }],
        }),
        create: jest.fn((args) => Promise.resolve({ id: 'qr-2', ...args.data })),
      },
    };
    const numbering = makeNumbering('PED-000099');
    const service = new QuoteRequestService(numbering, makePdfGenerator());

    const cloned = await runAsUser(db, () => service.clone('qr-1'));

    expect(numbering.nextNumber).toHaveBeenCalledWith('quoteRequest');
    expect(db.quoteRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 'PED-000099', supplierId: 'supplier-1' }) }),
    );
    expect((cloned as { id: string }).id).toBe('qr-2');
  });
});
