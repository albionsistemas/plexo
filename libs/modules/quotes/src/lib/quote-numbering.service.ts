import { BadRequestException, Injectable } from '@nestjs/common';
import { getTenantDb, getUserId } from '@plexo/database';

/**
 * "{prefix}-{n padded to 6}" per user - same pattern as
 * @plexo/purchases' PurchaseNumberingService, using
 * User.quotePrefix/quoteNextNumber instead. A separate series on purpose
 * (decision with the user, 2026-08-03), not shared with
 * quoteRequestPrefix even though both come from "cotización" in Spanish -
 * they're unrelated documents (see the schema comment on model Quote).
 * Assigned via an atomic `{ increment: 1 }`, race-free for the same reason
 * PurchaseNumberingService is.
 */
@Injectable()
export class QuoteNumberingService {
  async nextNumber(): Promise<string> {
    const userId = getUserId();
    if (!userId) {
      throw new BadRequestException('An authenticated user is required to number a quote');
    }

    const updated = await getTenantDb().user.update({
      where: { id: userId },
      data: { quoteNextNumber: { increment: 1 } },
      select: { quoteNextNumber: true, quotePrefix: true },
    });
    return `${updated.quotePrefix}-${String(updated.quoteNextNumber - 1).padStart(6, '0')}`;
  }
}
