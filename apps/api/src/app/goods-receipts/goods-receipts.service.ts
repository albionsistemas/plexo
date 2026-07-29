import { Injectable } from '@nestjs/common';
import { InventoryService } from '@plexo/inventory';
import { GoodsReceiptService, type CreateGoodsReceiptDto } from '@plexo/purchases';

/**
 * Composes GoodsReceiptService (libs/modules/purchases - creates the
 * remito itself, validated against the PurchaseOrder's pending quantity)
 * with InventoryService (moves stock) - same shape as SalesService
 * composing Invoicing+Inventory+Accounting. GoodsReceiptService can't call
 * InventoryService itself (this repo's rule: a lib module never imports
 * another module's Service), so this is the composition root for "a
 * receipt also moves stock, at the cost the order already fixed".
 *
 * Atomicity for free, same reason as sales.service.ts: everything runs
 * through getTenantDb(), the same per-request transaction opened by
 * TenantContextInterceptor - if any recordMovement() throws, the whole
 * transaction rolls back, including the GoodsReceipt just created above.
 */
@Injectable()
export class GoodsReceiptsService {
  constructor(
    private readonly goodsReceiptService: GoodsReceiptService,
    private readonly inventoryService: InventoryService,
  ) {}

  async createReceipt(dto: CreateGoodsReceiptDto) {
    const receipt = await this.goodsReceiptService.create(dto);
    for (const line of receipt.lines) {
      await this.inventoryService.recordMovement({
        warehouseId: receipt.warehouseId,
        articleVariantId: line.purchaseOrderLine.articleVariantId,
        type: 'PURCHASE_IN',
        quantity: line.quantity.toNumber(),
        unitCost: line.purchaseOrderLine.unitCost.toNumber(),
        purchaseOrderId: receipt.purchaseOrderId,
        goodsReceiptLineId: line.id,
      });
    }
    return receipt;
  }
}
