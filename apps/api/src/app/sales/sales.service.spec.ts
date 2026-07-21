import type { AccountingService } from '@plexo/accounting';
import { Prisma, tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { InvoicingService } from '@plexo/invoicing';
import { SalesService } from './sales.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeBranchDb(branch: unknown = defaultBranch()) {
  return { company: { findUnique: jest.fn().mockResolvedValue(branch) } };
}

function defaultBranch() {
  return {
    id: 'branch-1',
    pointOfSaleNumber: '0001',
    roles: [{ role: 'BRANCH' }],
  };
}

describe('SalesService.createSale', () => {
  it('resolves the branch, creates the invoice, posts its journal entry, then records one SALE_OUT movement per line', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      issueDate: new Date('2026-01-01'),
      lines: [
        { articleVariantId: 'variant-1', quantity: new Prisma.Decimal(3) },
        { articleVariantId: 'variant-2', quantity: new Prisma.Decimal(1) },
      ],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService);
    const dto = {
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      documentLetter: 'B' as const,
      branchId: 'branch-1',
      currencyId: 'currency-1',
      lines: [
        { articleVariantId: 'variant-1', quantity: 3 },
        { articleVariantId: 'variant-2', quantity: 1 },
      ],
    };

    const result = await runInTenant(makeBranchDb(), () => service.createSale(dto));

    expect(invoicingService.createInvoice).toHaveBeenCalledWith({
      customerId: dto.customerId,
      documentLetter: dto.documentLetter,
      pointOfSale: '0001',
      currencyId: dto.currencyId,
      globalDiscountPercent: undefined,
      dueDate: undefined,
      lines: dto.lines,
    });
    expect(accountingService.postInvoiceJournalEntry).toHaveBeenCalledWith({
      invoiceId: 'invoice-1',
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      date: invoice.issueDate,
    });
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(1, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'SALE_OUT',
      quantity: 3,
      invoiceId: 'invoice-1',
      sourceType: 'INVOICE',
      sourceId: 'invoice-1',
    });
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(2, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-2',
      type: 'SALE_OUT',
      quantity: 1,
      invoiceId: 'invoice-1',
      sourceType: 'INVOICE',
      sourceId: 'invoice-1',
    });
    expect(result).toBe(invoice);
  });

  it('rejects when the referenced company is not flagged as a BRANCH', async () => {
    const invoicingService = { createInvoice: jest.fn() } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {} as unknown as AccountingService;
    const service = new SalesService(invoicingService, inventoryService, accountingService);
    const db = makeBranchDb({ id: 'branch-1', pointOfSaleNumber: '0001', roles: [{ role: 'CUSTOMER' }] });

    await expect(
      runInTenant(db, () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow('not flagged as a branch');
    expect(invoicingService.createInvoice).not.toHaveBeenCalled();
  });

  it('propagates an insufficient-stock error without swallowing it (the enclosing tx rolls back the invoice too)', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      issueDate: new Date('2026-01-01'),
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(999) }],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const failure = new Error('Insufficient stock in this warehouse');
    const inventoryService = {
      recordMovement: jest.fn().mockRejectedValue(failure),
    } as unknown as InventoryService;
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService);

    await expect(
      runInTenant(makeBranchDb(), () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 999 }],
        }),
      ),
    ).rejects.toThrow(failure);
  });

  it('propagates an unbalanced-entry error from accounting without recording any stock movement', async () => {
    const invoice = {
      id: 'invoice-1',
      subtotal: new Prisma.Decimal(100),
      taxTotal: new Prisma.Decimal(21),
      total: new Prisma.Decimal(121),
      issueDate: new Date('2026-01-01'),
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(1) }],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const inventoryService = {
      recordMovement: jest.fn().mockResolvedValue({}),
    } as unknown as InventoryService;
    const failure = new Error('Journal entry is not balanced');
    const accountingService = {
      postInvoiceJournalEntry: jest.fn().mockRejectedValue(failure),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService);

    await expect(
      runInTenant(makeBranchDb(), () =>
        service.createSale({
          customerId: 'customer-1',
          warehouseId: 'warehouse-1',
          documentLetter: 'B',
          branchId: 'branch-1',
          currencyId: 'currency-1',
          lines: [{ articleVariantId: 'variant-1', quantity: 1 }],
        }),
      ),
    ).rejects.toThrow(failure);
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });
});

describe('SalesService.voidSale', () => {
  it('creates the credit note then reverses the invoice journal entry', async () => {
    const creditNote = { id: 'credit-note-1', invoiceId: 'invoice-1' };
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const accountingService = {
      reverseInvoiceJournalEntry: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService);
    const dto = { invoiceId: 'invoice-1', reason: 'Devolución de mercadería' };

    const result = await service.voidSale(dto);

    expect(invoicingService.createCreditNote).toHaveBeenCalledWith(dto);
    expect(accountingService.reverseInvoiceJournalEntry).toHaveBeenCalledWith('invoice-1');
    expect(result).toBe(creditNote);
  });

  it('propagates a reversal failure without swallowing it', async () => {
    const creditNote = { id: 'credit-note-1', invoiceId: 'invoice-1' };
    const invoicingService = {
      createCreditNote: jest.fn().mockResolvedValue(creditNote),
    } as unknown as InvoicingService;
    const inventoryService = {} as unknown as InventoryService;
    const failure = new Error('Journal entry not found');
    const accountingService = {
      reverseInvoiceJournalEntry: jest.fn().mockRejectedValue(failure),
    } as unknown as AccountingService;

    const service = new SalesService(invoicingService, inventoryService, accountingService);

    await expect(
      service.voidSale({ invoiceId: 'invoice-1', reason: 'Devolución de mercadería' }),
    ).rejects.toThrow(failure);
  });
});
