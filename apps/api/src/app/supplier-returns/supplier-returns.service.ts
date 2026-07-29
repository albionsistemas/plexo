import { Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { SupplierReturnService, type CreateSupplierReturnDto } from '@plexo/purchases';

/**
 * Composes SupplierReturnService (libs/modules/purchases - creates the
 * devolución itself, validated against what that remito line actually
 * received) with InventoryService (moves stock out) and AccountingService
 * (reverses the proportional GRNI accrual - Dr Mercadería Recibida No
 * Facturada / Cr Mercaderías, see AccountingService.
 * reverseSupplierReturnAccrual) - same shape as GoodsReceiptsService
 * composing GoodsReceiptService + InventoryService + AccountingService,
 * which itself mirrors SalesService. SupplierReturnService can't call
 * InventoryService/AccountingService directly (this repo's rule: a lib
 * module never imports another module's Service), so this is the
 * composition root.
 *
 * No unitCost passed to recordMovement - SUPPLIER_RETURN is an outbound
 * type, InventoryService stamps the ledger's current average cost on it
 * itself (same as SALE_OUT/PRODUCTION_OUT), never asked from the caller.
 * The GRNI reversal amount below uses PurchaseOrderLine.unitCost instead
 * (the accrual it's reversing was booked at that cost, not the ledger's
 * current average, which can have drifted since).
 *
 * Atomicity for free, same reason as goods-receipts.service.ts: everything
 * runs through getTenantDb(), the same per-request transaction - if any
 * recordMovement()/accounting call throws, the whole transaction rolls
 * back, including the SupplierReturn just created above.
 */
@Injectable()
export class SupplierReturnsService {
  constructor(
    private readonly supplierReturnService: SupplierReturnService,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
  ) {}

  async createReturn(dto: CreateSupplierReturnDto) {
    const supplierReturn = await this.supplierReturnService.create(dto);
    let reversalAmount = new Prisma.Decimal(0);
    for (const line of supplierReturn.lines) {
      await this.inventoryService.recordMovement({
        warehouseId: supplierReturn.goodsReceipt.warehouseId,
        articleVariantId: line.goodsReceiptLine.purchaseOrderLine.articleVariantId,
        type: 'SUPPLIER_RETURN',
        quantity: line.quantity.toNumber(),
        goodsReceiptLineId: line.goodsReceiptLineId,
        sourceType: 'SUPPLIER_RETURN',
        sourceId: supplierReturn.id,
      });
      reversalAmount = reversalAmount.add(line.quantity.mul(line.goodsReceiptLine.purchaseOrderLine.unitCost));
    }
    await this.accountingService.reverseSupplierReturnAccrual({
      supplierReturnId: supplierReturn.id,
      amount: reversalAmount,
    });
    return supplierReturn;
  }
}
