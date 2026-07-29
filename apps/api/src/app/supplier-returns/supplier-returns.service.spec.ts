import type { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { SupplierReturnService } from '@plexo/purchases';
import { SupplierReturnsService } from './supplier-returns.service.js';

// @plexo/purchases' barrel also re-exports PdfGeneratorService, which pulls
// in @react-pdf/renderer (ESM-only) - apps/api's jest config has no
// transform for it. This test never touches the real SupplierReturnService
// (only mocks it), so an explicit factory avoids ever requiring the real
// module/its ESM chain at all - same fix as goods-receipts.service.spec.ts.
jest.mock('@plexo/purchases', () => ({ SupplierReturnService: jest.fn() }));

function makeSupplierReturn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'return-1',
    goodsReceipt: { id: 'receipt-1', warehouseId: 'warehouse-1' },
    lines: [
      {
        id: 'return-line-1',
        goodsReceiptLineId: 'receipt-line-1',
        quantity: new Prisma.Decimal(2),
        goodsReceiptLine: {
          purchaseOrderLine: { articleVariantId: 'variant-1', unitCost: new Prisma.Decimal(150) },
        },
      },
    ],
    ...overrides,
  };
}

describe('SupplierReturnsService.createReturn', () => {
  it('creates the return, then records a SUPPLIER_RETURN per line with no unitCost (the ledger stamps its own average)', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const inventoryService = { recordMovement: jest.fn().mockResolvedValue({}) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(supplierReturnService, inventoryService, accountingService);
    const dto = {
      goodsReceiptId: 'receipt-1',
      reason: 'tapa en mal estado',
      lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
    };

    const result = await service.createReturn(dto);

    expect(supplierReturnService.create).toHaveBeenCalledWith(dto);
    expect(inventoryService.recordMovement).toHaveBeenCalledWith({
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'SUPPLIER_RETURN',
      quantity: 2,
      goodsReceiptLineId: 'receipt-line-1',
      sourceType: 'SUPPLIER_RETURN',
      sourceId: 'return-1',
    });
    // 2 * 150 = 300
    const reversalArg = (accountingService.reverseSupplierReturnAccrual as jest.Mock).mock.calls[0][0];
    expect(reversalArg.supplierReturnId).toBe('return-1');
    expect((reversalArg.amount as Prisma.Decimal).toNumber()).toBe(300);
    expect(result).toBe(supplierReturn);
  });

  it('propagates a recordMovement failure without swallowing it (the enclosing tx rolls back the return too)', async () => {
    const supplierReturn = makeSupplierReturn();
    const supplierReturnService = {
      create: jest.fn().mockResolvedValue(supplierReturn),
    } as unknown as SupplierReturnService;
    const failure = new Error('Insufficient stock in this warehouse');
    const inventoryService = { recordMovement: jest.fn().mockRejectedValue(failure) } as unknown as InventoryService;
    const accountingService = {
      reverseSupplierReturnAccrual: jest.fn().mockResolvedValue({}),
    } as unknown as AccountingService;
    const service = new SupplierReturnsService(supplierReturnService, inventoryService, accountingService);

    await expect(
      service.createReturn({
        goodsReceiptId: 'receipt-1',
        reason: 'defectuoso',
        lines: [{ goodsReceiptLineId: 'receipt-line-1', quantity: 2 }],
      }),
    ).rejects.toThrow(failure);
    expect(accountingService.reverseSupplierReturnAccrual).not.toHaveBeenCalled();
  });
});
