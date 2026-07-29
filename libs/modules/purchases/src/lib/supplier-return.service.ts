import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { CreateSupplierReturnDto } from './dto/create-supplier-return.dto.js';

const RETURN_DETAIL_INCLUDE = {
  lines: {
    include: {
      goodsReceiptLine: { include: { purchaseOrderLine: { select: { id: true, articleVariantId: true } } } },
    },
  },
  goodsReceipt: { select: { id: true, warehouseId: true } },
  returnedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.SupplierReturnInclude;

/** Sum of what's already been returned per GoodsReceiptLine, across every
 * SupplierReturn ever logged against it - same shape as GoodsReceiptService.
 * getReceivedQuantitiesByLine's own `alreadyReceivedByLine`. Exported so
 * GoodsReceiptService can net returns out of "received" when computing
 * receivedQuantity/pendingQuantity per PurchaseOrderLine. */
export async function getReturnedQuantitiesByGoodsReceiptLine(
  goodsReceiptLineIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (goodsReceiptLineIds.length === 0) {
    return new Map();
  }
  const rows = await getTenantDb().supplierReturnLine.groupBy({
    by: ['goodsReceiptLineId'],
    where: { goodsReceiptLineId: { in: goodsReceiptLineIds } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((row) => [row.goodsReceiptLineId, row._sum.quantity ?? new Prisma.Decimal(0)]));
}

/**
 * Devolución al proveedor (e.g. defective units) out of a specific remito -
 * quantity-only, no price (same reasoning as GoodsReceiptService: cost is
 * read from the ledger's current average, not asked again). Reopens
 * "pending" on the PurchaseOrder line it traces back to, since
 * GoodsReceiptService.getReceivedQuantitiesByLine nets returns out of
 * received - a supplier owing replacement units shows up the same way a
 * partial delivery does, no separate status/flag needed.
 *
 * Same lock+accumulate recipe as GoodsReceiptService.create /
 * InvoicingService.createCreditNote: never lets the accumulated returned
 * quantity for a GoodsReceiptLine exceed what was actually received on it.
 */
@Injectable()
export class SupplierReturnService {
  async create(dto: CreateSupplierReturnDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const returnedByUserId = requireUserId();

    const goodsReceipt = await db.goodsReceipt.findUnique({
      where: { id: dto.goodsReceiptId },
      include: { lines: true },
    });
    if (!goodsReceipt) {
      throw new NotFoundException('Goods receipt not found');
    }

    // Lock first, in requested order, so two concurrent returns against
    // the same receipt line serialize instead of racing past the check
    // below - same recipe as GoodsReceiptService.create.
    for (const line of dto.lines) {
      await db.$queryRaw`SELECT id FROM goods_receipt_lines WHERE id = ${line.goodsReceiptLineId} FOR UPDATE`;
    }

    const receiptLinesById = new Map(goodsReceipt.lines.map((l) => [l.id, l]));
    const alreadyReturnedByLine = await getReturnedQuantitiesByGoodsReceiptLine(
      dto.lines.map((l) => l.goodsReceiptLineId),
    );

    const linesToCreate: { goodsReceiptLineId: string; quantity: Prisma.Decimal }[] = [];
    for (const requested of dto.lines) {
      const receiptLine = receiptLinesById.get(requested.goodsReceiptLineId);
      if (!receiptLine) {
        throw new BadRequestException(
          `Goods receipt line ${requested.goodsReceiptLineId} does not belong to this receipt`,
        );
      }
      const quantity = new Prisma.Decimal(requested.quantity);
      const priorlyReturned = alreadyReturnedByLine.get(receiptLine.id) ?? new Prisma.Decimal(0);
      if (priorlyReturned.add(quantity).gt(receiptLine.quantity)) {
        throw new BadRequestException(
          `Cannot return ${quantity.toString()} of line ${receiptLine.id}: only ${receiptLine.quantity.sub(priorlyReturned).toString()} available to return`,
        );
      }
      linesToCreate.push({ goodsReceiptLineId: receiptLine.id, quantity });
    }

    return db.supplierReturn.create({
      data: {
        tenantId,
        goodsReceiptId: dto.goodsReceiptId,
        reason: dto.reason,
        notes: dto.notes,
        returnedByUserId,
        lines: { createMany: { data: linesToCreate.map((l) => ({ tenantId, ...l })) } },
      },
      include: RETURN_DETAIL_INCLUDE,
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
