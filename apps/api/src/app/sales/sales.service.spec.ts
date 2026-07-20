import { Prisma } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { InvoicingService } from '@plexo/invoicing';
import { SalesService } from './sales.service.js';

describe('SalesService.createSale', () => {
  it('creates the invoice then records one SALE_OUT movement per line, tagged with the invoice id', async () => {
    const invoice = {
      id: 'invoice-1',
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

    const service = new SalesService(invoicingService, inventoryService);
    const dto = {
      customerId: 'customer-1',
      warehouseId: 'warehouse-1',
      documentLetter: 'B' as const,
      pointOfSale: '0001',
      currencyId: 'currency-1',
      lines: [
        { articleVariantId: 'variant-1', quantity: 3 },
        { articleVariantId: 'variant-2', quantity: 1 },
      ],
    };

    const result = await service.createSale(dto);

    expect(invoicingService.createInvoice).toHaveBeenCalledWith({
      customerId: dto.customerId,
      documentLetter: dto.documentLetter,
      pointOfSale: dto.pointOfSale,
      currencyId: dto.currencyId,
      globalDiscountPercent: undefined,
      dueDate: undefined,
      lines: dto.lines,
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

  it('propagates an insufficient-stock error without swallowing it (the enclosing tx rolls back the invoice too)', async () => {
    const invoice = {
      id: 'invoice-1',
      lines: [{ articleVariantId: 'variant-1', quantity: new Prisma.Decimal(999) }],
    };
    const invoicingService = {
      createInvoice: jest.fn().mockResolvedValue(invoice),
    } as unknown as InvoicingService;
    const failure = new Error('Insufficient stock in this warehouse');
    const inventoryService = {
      recordMovement: jest.fn().mockRejectedValue(failure),
    } as unknown as InventoryService;

    const service = new SalesService(invoicingService, inventoryService);

    await expect(
      service.createSale({
        customerId: 'customer-1',
        warehouseId: 'warehouse-1',
        documentLetter: 'B',
        pointOfSale: '0001',
        currencyId: 'currency-1',
        lines: [{ articleVariantId: 'variant-1', quantity: 999 }],
      }),
    ).rejects.toThrow(failure);
  });
});
