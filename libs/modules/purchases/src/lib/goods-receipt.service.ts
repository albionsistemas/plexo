import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto.js';

const RECEIPT_DETAIL_INCLUDE = {
  lines: { include: { purchaseOrderLine: { select: { id: true, articleVariantId: true, unitCost: true } } } },
  receivedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.GoodsReceiptInclude;

/** Sum of what's already been received per PurchaseOrderLine, across every
 * GoodsReceipt ever logged against it - same shape as InvoicingService.
 * createCreditNote's `alreadyCreditedByLine` (invoicing.service.ts), just
 * for remitos instead of partial credit notes. Exported so
 * PurchaseOrderService can reuse it for display (receivedQuantity/
 * pendingQuantity per line) without duplicating the aggregate query. */
export async function getReceivedQuantitiesByLine(
  purchaseOrderLineIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (purchaseOrderLineIds.length === 0) {
    return new Map();
  }
  const rows = await getTenantDb().goodsReceiptLine.groupBy({
    by: ['purchaseOrderLineId'],
    where: { purchaseOrderLineId: { in: purchaseOrderLineIds } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.purchaseOrderLineId, row._sum.quantity ?? new Prisma.Decimal(0)]));
}

/**
 * Recepción de mercadería (remito) against an already-SENT PurchaseOrder -
 * quantity-only, no price (the cost already lives on PurchaseOrderLine.
 * unitCost, read back by GoodsReceiptsService in apps/api to drive the
 * actual PURCHASE_IN stock movements - this service never touches
 * Inventory itself, see the module-boundary rule this repo already
 * follows for InvoicingService.createCreditNote/SalesService.voidSale).
 *
 * Supports partial deliveries: multiple receipts can be logged against the
 * same order, each capped at what's still pending for that line. Never
 * lets the accumulated received quantity exceed what was ordered - a
 * concurrent double-submission is guarded by locking the targeted
 * PurchaseOrderLine rows first, same recipe as createCreditNote.
 */
@Injectable()
export class GoodsReceiptService {
  async create(dto: CreateGoodsReceiptDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const receivedByUserId = requireUserId();

    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id: dto.purchaseOrderId },
      include: { lines: true },
    });
    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }
    if (purchaseOrder.status !== 'SENT') {
      throw new BadRequestException('Only a SENT purchase order can receive goods');
    }

    const warehouse = await db.warehouse.findUnique({ where: { id: dto.warehouseId } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    // Lock first, in requested order, so two concurrent receipts against
    // the same line serialize instead of racing past the check below -
    // same recipe as InvoicingService.createCreditNote.
    for (const line of dto.lines) {
      await db.$queryRaw`SELECT id FROM purchase_order_lines WHERE id = ${line.purchaseOrderLineId} FOR UPDATE`;
    }

    const poLinesById = new Map(purchaseOrder.lines.map((l) => [l.id, l]));
    const alreadyReceivedByLine = await getReceivedQuantitiesByLine(dto.lines.map((l) => l.purchaseOrderLineId));

    const linesToCreate: { purchaseOrderLineId: string; quantity: Prisma.Decimal }[] = [];
    for (const requested of dto.lines) {
      const poLine = poLinesById.get(requested.purchaseOrderLineId);
      if (!poLine) {
        throw new BadRequestException(
          `Purchase order line ${requested.purchaseOrderLineId} does not belong to this order`,
        );
      }
      const quantity = new Prisma.Decimal(requested.quantity);
      const priorlyReceived = alreadyReceivedByLine.get(poLine.id) ?? new Prisma.Decimal(0);
      if (priorlyReceived.add(quantity).gt(poLine.quantity)) {
        throw new BadRequestException(
          `Cannot receive ${quantity.toString()} of line ${poLine.id}: only ${poLine.quantity.sub(priorlyReceived).toString()} left to receive`,
        );
      }
      linesToCreate.push({ purchaseOrderLineId: poLine.id, quantity });
    }

    return db.goodsReceipt.create({
      data: {
        tenantId,
        purchaseOrderId: dto.purchaseOrderId,
        warehouseId: dto.warehouseId,
        supplierDocNumber: dto.supplierDocNumber,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : undefined,
        notes: dto.notes,
        receivedByUserId,
        lines: { createMany: { data: linesToCreate.map((l) => ({ tenantId, ...l })) } },
      },
      include: RECEIPT_DETAIL_INCLUDE,
    });
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
