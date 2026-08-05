import type { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import type { PurchaseInvoiceService } from '@plexo/purchases';
import { PurchaseInvoicesService } from './purchase-invoices.service.js';

// Same reasoning as goods-receipts.service.spec.ts: @plexo/purchases' barrel
// also re-exports PdfGeneratorService (ESM-only @react-pdf/renderer), which
// apps/api's jest config has no transform for - this test never touches the
// real PurchaseInvoiceService, only mocks it.
jest.mock('@plexo/purchases', () => ({ PurchaseInvoiceService: jest.fn() }));

describe('PurchaseInvoicesService.createInvoice', () => {
  it('posts the journal entry dated the supplier\'s own invoice date, not "now"', async () => {
    const invoice = {
      id: 'pinv-1',
      total: new Prisma.Decimal(1000),
      supplierInvoiceDate: new Date('2026-07-15'),
      taxLines: [
        { type: 'IVA_CREDITO', amount: new Prisma.Decimal(210) },
        { type: 'PERCEPCION', concept: 'IIBB', amount: new Prisma.Decimal(30) },
      ],
    };
    const purchaseInvoiceService = {
      create: jest.fn().mockResolvedValue({
        invoice,
        grniClearedAmount: new Prisma.Decimal(700),
        nonGrniAmount: new Prisma.Decimal(60),
      }),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postPurchaseInvoiceJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService);

    await service.createInvoice({
      purchaseOrderId: 'po-1',
      supplierInvoiceNumber: '0001-00001234',
      supplierInvoiceDate: '2026-07-15',
      subtotal: 760,
    } as never);

    const journalArg = (accountingService.postPurchaseInvoiceJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalArg.date).toEqual(new Date('2026-07-15'));
  });
});

describe('PurchaseInvoicesService.recordPayment', () => {
  it('posts the journal entry dated when the payment was actually made, not "now"', async () => {
    const payment = {
      id: 'pay-1',
      amount: new Prisma.Decimal(500),
      paidAt: new Date('2026-07-20'),
      withholdings: [],
    };
    const purchaseInvoiceService = {
      recordPayment: jest.fn().mockResolvedValue(payment),
    } as unknown as PurchaseInvoiceService;
    const accountingService = {
      postSupplierPaymentJournalEntry: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new PurchaseInvoicesService(purchaseInvoiceService, accountingService);

    await service.recordPayment('pinv-1', { amount: 500, method: 'Transferencia' } as never);

    const journalArg = (accountingService.postSupplierPaymentJournalEntry as jest.Mock).mock.calls[0][0];
    expect(journalArg.date).toEqual(new Date('2026-07-20'));
  });
});
