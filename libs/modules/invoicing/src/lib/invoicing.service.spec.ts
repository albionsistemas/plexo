import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { EmailSender } from './email-sender.port.js';
import type { ElectronicInvoicingPort } from './electronic-invoicing.port.js';
import { InvoicingService } from './invoicing.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T, userId = 'user-1'): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId, tx: db as never }, fn);
}

function runWithoutUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, fn);
}

function makeEmailSender(): EmailSender {
  return { sendInvoiceEmail: jest.fn().mockResolvedValue(undefined) };
}

function makeElectronicInvoicing(): ElectronicInvoicingPort {
  return {
    requestCae: jest
      .fn()
      .mockResolvedValue({ cae: 'CAE-1', caeExpiry: new Date('2030-01-01') }),
  };
}

const baseDto = {
  customerId: 'customer-1',
  documentLetter: 'B' as const,
  pointOfSale: '0001',
  currencyId: 'currency-1',
  lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
};

describe('InvoicingService.createInvoice', () => {
  it('throws when there is no authenticated user in context', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());
    await expect(runWithoutUser({}, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when the customer does not exist', async () => {
    const db = { customer: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when the currency does not exist', async () => {
    const db = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', email: null }) },
      currency: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws when a non-base currency has no exchange rate on file', async () => {
    const db = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', email: null }) },
      currency: {
        findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: false }),
      },
      exchangeRateHistory: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws when a line references a missing article variant', async () => {
    const db = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', email: null }) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('runs the strict calculation chain: convert->line discount->subtotal->global discount->tax, distributed proportionally across lines with different rates', async () => {
    const emailSender = makeEmailSender();
    const electronicInvoicing = makeElectronicInvoicing();
    const service = new InvoicingService(emailSender, electronicInvoicing);

    const dto = {
      customerId: 'customer-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      globalDiscountPercent: 10,
      lines: [
        { articleVariantId: 'variant-a', quantity: 1, discountType: 'PERCENTAGE' as const, discountValue: 10 },
        { articleVariantId: 'variant-b', quantity: 2, discountType: 'AMOUNT' as const, discountValue: 20 },
      ],
    };

    const variants: Record<string, unknown> = {
      'variant-a': {
        id: 'variant-a',
        unitPrice: new Prisma.Decimal(100),
        article: { taxDefinition: { calculationType: 'PERCENTAGE', rate: new Prisma.Decimal(21), code: 'IVA_21' } },
      },
      'variant-b': {
        id: 'variant-b',
        unitPrice: new Prisma.Decimal(50),
        article: { taxDefinition: null },
      },
    };

    const createdInvoice = { id: 'invoice-1', number: '00000001', total: new Prisma.Decimal(358.02), lines: [] };
    const db = {
      customer: {
        findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Acme', taxId: '20-1-1', email: 'buyer@example.com' }),
      },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', code: 'ARS', isBase: false }) },
      exchangeRateHistory: {
        findFirst: jest.fn().mockResolvedValue({ rate: new Prisma.Decimal(2) }),
      },
      articleVariant: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve(variants[args.where.id]),
        ),
      },
      invoice: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdInvoice),
        update: jest.fn().mockResolvedValue(createdInvoice),
      },
    };

    await runInTenant(db, () => service.createInvoice(dto));

    const createArgs = (db.invoice.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.exchangeRate.toNumber()).toBe(2);
    expect(createArgs.data.customerName).toBe('Acme');
    expect(createArgs.data.customerTaxId).toBe('20-1-1');
    expect(createArgs.data.subtotal.toNumber()).toBeCloseTo(324, 6);
    expect(createArgs.data.taxTotal.toNumber()).toBeCloseTo(34.02, 6);
    expect(createArgs.data.total.toNumber()).toBeCloseTo(358.02, 6);

    const lines = createArgs.data.lines.createMany.data;
    const lineA = lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-a');
    const lineB = lines.find((l: { articleVariantId: string }) => l.articleVariantId === 'variant-b');
    expect(lineA.netAmount.toNumber()).toBeCloseTo(180, 6);
    expect(lineA.lineTotal.toNumber()).toBeCloseTo(196.02, 6);
    expect(lineB.netAmount.toNumber()).toBeCloseTo(180, 6);
    expect(lineB.lineTotal.toNumber()).toBeCloseTo(162, 6);

    expect(electronicInvoicing.requestCae).toHaveBeenCalled();
    expect(emailSender.sendInvoiceEmail).toHaveBeenCalledWith({
      to: 'buyer@example.com',
      invoiceNumber: '0001-00000001',
      total: '358.02',
    });
  });

  it('rejects a FORMULA tax definition rather than silently mis-taxing', async () => {
    const db = {
      customer: { findUnique: jest.fn().mockResolvedValue({ id: 'customer-1', email: null }) },
      currency: { findUnique: jest.fn().mockResolvedValue({ id: 'currency-1', isBase: true }) },
      articleVariant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'variant-1',
          unitPrice: new Prisma.Decimal(100),
          article: { taxDefinition: { calculationType: 'FORMULA', code: 'WEIRD_TAX' } },
        }),
      },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(runInTenant(db, () => service.createInvoice(baseDto))).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('InvoicingService.createCreditNote', () => {
  it('throws when the invoice does not exist', async () => {
    const db = { invoice: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(
      runInTenant(db, () => service.createCreditNote({ invoiceId: 'missing', reason: 'x' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('refuses to credit an invoice that was never issued (no CAE)', async () => {
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', afipCae: null }) },
    };
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());

    await expect(
      runInTenant(db, () => service.createCreditNote({ invoiceId: 'invoice-1', reason: 'x' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('mirrors the invoice totals onto the credit note and requests its own CAE', async () => {
    const invoice = {
      id: 'invoice-1',
      afipCae: 'CAE-ORIGINAL',
      pointOfSale: '0001',
      documentLetter: 'B',
      currencyId: 'currency-1',
      exchangeRate: new Prisma.Decimal(2),
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
    };
    const createdCreditNote = { id: 'cn-1', number: '00000001', total: invoice.total };
    const electronicInvoicing = makeElectronicInvoicing();
    const db = {
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      creditNote: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue(createdCreditNote),
        update: jest.fn().mockResolvedValue(createdCreditNote),
      },
    };
    const service = new InvoicingService(makeEmailSender(), electronicInvoicing);

    await runInTenant(db, () =>
      service.createCreditNote({ invoiceId: 'invoice-1', reason: 'return' }),
    );

    expect(db.creditNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId: 'invoice-1',
        total: invoice.total,
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        reason: 'return',
      }),
    });
    expect(electronicInvoicing.requestCae).toHaveBeenCalled();
  });
});

describe('InvoicingService.recordReceipt', () => {
  it('marks the invoice PARTIALLY_PAID when the receipt does not cover the full balance', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      receipt: { create: jest.fn().mockResolvedValue({ id: 'receipt-1' }) },
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 40, method: 'CASH' }),
    );

    const updateArgs = (db.invoice.update as jest.Mock).mock.calls[0][0];
    expect(updateArgs.data.status).toBe('PARTIALLY_PAID');
    expect(updateArgs.data.balanceDue.toNumber()).toBe(60);
  });

  it('marks the invoice PAID when the receipt covers the full balance', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(100) }),
        update: jest.fn().mockResolvedValue({}),
      },
      receipt: { create: jest.fn().mockResolvedValue({ id: 'receipt-1' }) },
    };

    await runInTenant(db, () =>
      service.recordReceipt({ invoiceId: 'invoice-1', amount: 100, method: 'CASH' }),
    );

    expect((db.invoice.update as jest.Mock).mock.calls[0][0].data.status).toBe('PAID');
  });

  it('rejects a receipt larger than the balance due', async () => {
    const service = new InvoicingService(makeEmailSender(), makeElectronicInvoicing());
    const db = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ id: 'invoice-1', balanceDue: new Prisma.Decimal(50) }),
      },
    };

    await expect(
      runInTenant(db, () =>
        service.recordReceipt({ invoiceId: 'invoice-1', amount: 100, method: 'CASH' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
