import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { SupplierReturnService, type CreateSupplierReturnDto } from '@plexo/purchases';

/**
 * Composes SupplierReturnService (libs/modules/purchases - creates the
 * devolución itself, validated against what that remito line actually
 * received) with InventoryService (moves stock out) and AccountingService
 * - same shape as GoodsReceiptsService composing GoodsReceiptService +
 * InventoryService + AccountingService, which itself mirrors SalesService.
 * SupplierReturnService can't call InventoryService/AccountingService
 * directly (this repo's rule: a lib module never imports another module's
 * Service), so this is the composition root.
 *
 * No unitCost passed to recordMovement - SUPPLIER_RETURN is an outbound
 * type, InventoryService stamps the ledger's current average cost on it
 * itself (same as SALE_OUT/PRODUCTION_OUT), never asked from the caller.
 * The reversal amount below uses PurchaseOrderLine.unitCost instead (the
 * accrual it's reversing was booked at that cost, not the ledger's current
 * average, which can have drifted since).
 *
 * Which account absorbs the reversal depends on whether the underlying
 * remito was already invoiced by the time this return is recorded (checked
 * here via PurchaseInvoiceReceipt, since neither SupplierReturnService nor
 * AccountingService has a notion of "already invoiced" on their own):
 *  - Not yet invoiced: the GRNI accrual for this receipt is still sitting
 *    there uncleared - reverse it directly (reverseSupplierReturnAccrual,
 *    Dr GRNI / Cr Mercaderías). PurchaseInvoiceService.create() already
 *    nets returns out of grniClearedAmount, so the invoice that eventually
 *    covers this receipt bills the right (lower) amount on its own.
 *  - Already invoiced: GRNI for this receipt was already cleared into
 *    Proveedores when that PurchaseInvoice was posted - crediting GRNI
 *    again would leave a debit balance nothing will ever clear. What's
 *    actually owed less now is Proveedores (reverseSupplierReturnAgainstPayable,
 *    Dr Proveedores / Cr Mercaderías), and that invoice's own balanceDue
 *    has to come down by the same amount so the subsidiary ledger (what
 *    Cuentas a Pagar shows as pending on that invoice) agrees with the
 *    control account.
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

    const db = getTenantDb();
    const invoiceLink = await db.purchaseInvoiceReceipt.findFirst({
      where: { goodsReceiptId: supplierReturn.goodsReceiptId },
      select: { purchaseInvoiceId: true },
    });

    if (invoiceLink) {
      const invoice = await db.purchaseInvoice.findUniqueOrThrow({
        where: { id: invoiceLink.purchaseInvoiceId },
      });
      const balanceDue = invoice.balanceDue.sub(reversalAmount);
      if (balanceDue.lt(0)) {
        throw new BadRequestException(
          `La devolución ($${reversalAmount.toFixed(2)}) supera el saldo pendiente de la factura de compra vinculada ($${invoice.balanceDue.toFixed(2)})`,
        );
      }
      await db.purchaseInvoice.update({
        where: { id: invoice.id },
        data: { balanceDue, status: balanceDue.isZero() ? 'PAID' : 'PARTIALLY_PAID' },
      });
      await this.accountingService.reverseSupplierReturnAgainstPayable({
        supplierReturnId: supplierReturn.id,
        amount: reversalAmount,
      });
    } else {
      await this.accountingService.reverseSupplierReturnAccrual({
        supplierReturnId: supplierReturn.id,
        amount: reversalAmount,
      });
    }

    return supplierReturn;
  }
}
