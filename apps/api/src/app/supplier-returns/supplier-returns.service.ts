import { Injectable } from '@nestjs/common';
import { InventoryService } from '@plexo/inventory';
import { SupplierReturnService, type CreateSupplierReturnDto } from '@plexo/purchases';

/**
 * Composes SupplierReturnService (libs/modules/purchases - creates the
 * devolución itself, validated against what that remito line actually
 * received) with InventoryService (moves stock out) - same shape as
 * GoodsReceiptsService composing GoodsReceiptService + InventoryService,
 * which itself mirrors SalesService. SupplierReturnService can't call
 * InventoryService directly (this repo's rule: a lib module never imports
 * another module's Service), so this is the composition root.
 *
 * No unitCost passed to recordMovement - SUPPLIER_RETURN is an outbound
 * type, InventoryService stamps the ledger's current average cost on it
 * itself (same as SALE_OUT/PRODUCTION_OUT), never asked from the caller.
 *
 * Atomicity for free, same reason as goods-receipts.service.ts: everything
 * runs through getTenantDb(), the same per-request transaction - if any
 * recordMovement() throws, the whole transaction rolls back, including the
 * SupplierReturn just created above.
 */
@Injectable()
export class SupplierReturnsService {
  constructor(
    private readonly supplierReturnService: SupplierReturnService,
    private readonly inventoryService: InventoryService,
  ) {}

  async createReturn(dto: CreateSupplierReturnDto) {
    const supplierReturn = await this.supplierReturnService.create(dto);
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
    }
    return supplierReturn;
  }
}
