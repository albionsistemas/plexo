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
          lines: [{ articleVariantId: 'variant-1', quantity: 3, estimatedUnitCost: new Prisma.Decimal(15), notes: null }],
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      purchaseOrder: {
        create: jest.fn((args) => Promise.resolve({ id: 'po-1', ...args.data })),
      },
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
