import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId } from '@plexo/database';

export type PurchaseDocumentKind = 'quoteRequest' | 'purchaseOrder';

/**
 * "{prefix}-{n padded to 6}" per user, per document kind - a deliberately
 * separate series per user (decision with the user, 2026-07-27), not one
 * shared tenant-wide series like Invoice.number. Assigned via an atomic
 * `{ increment: 1 }` on the user's own row (a single UPDATE statement),
 * which is race-free unlike nextInvoiceNumber's count()+1 approach in
 * invoicing.service.ts - see that method's docstring for the tradeoff this
 * improves on.
 */
@Injectable()
export class PurchaseNumberingService {
  async nextNumber(kind: PurchaseDocumentKind): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a purchases document');
    }

    switch (kind) {
      case 'quoteRequest': {
        const updated = await getTenantDb().user.update({
          where: { id: userId },
          data: { quoteRequestNextNumber: { increment: 1 } },
          select: { quoteRequestNextNumber: true, quoteRequestPrefix: true },
        });
        return format(updated.quoteRequestPrefix, updated.quoteRequestNextNumber - 1);
      }
      case 'purchaseOrder': {
        const updated = await getTenantDb().user.update({
          where: { id: userId },
          data: { purchaseOrderNextNumber: { increment: 1 } },
          select: { purchaseOrderNextNumber: true, purchaseOrderPrefix: true },
        });
        return format(updated.purchaseOrderPrefix, updated.purchaseOrderNextNumber - 1);
      }
    }
  }
}

function format(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(6, '0')}`;
}
