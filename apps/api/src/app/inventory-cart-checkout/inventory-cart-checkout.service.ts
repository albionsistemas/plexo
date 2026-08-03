import { Injectable } from '@nestjs/common';
import { QuoteRequestService } from '@plexo/purchases';
import { QuoteService } from '@plexo/quotes';
import type { CheckoutPurchaseRequestsDto } from './dto/checkout-purchase-requests.dto.js';
import type { CheckoutQuoteDto } from './dto/checkout-quote.dto.js';

/**
 * Composes QuoteRequestService (@plexo/purchases) and QuoteService
 * (@plexo/quotes) with the Inventory cart - same composition-root shape as
 * GoodsReceiptsService, needed because neither purchases nor quotes may
 * import each other's (or any other module's) Service directly.
 */
@Injectable()
export class InventoryCartCheckoutService {
  constructor(
    private readonly quoteRequestService: QuoteRequestService,
    private readonly quoteService: QuoteService,
  ) {}

  /** One QuoteRequest per group/supplier - see CheckoutPurchaseRequestsDto's
   * doc comment for why these are independent documents, not a linked
   * rfqGroupId set. */
  async checkoutPurchaseRequests(dto: CheckoutPurchaseRequestsDto) {
    const created = [];
    for (const group of dto.groups) {
      created.push(
        await this.quoteRequestService.create({
          supplierId: group.supplierId,
          currencyId: group.currencyId,
          notes: group.notes,
          lines: group.lines.map((line) => ({
            articleVariantId: line.articleVariantId,
            quantity: line.quantity,
            estimatedUnitCost: line.estimatedUnitCost,
          })),
        }),
      );
    }
    return created;
  }

  checkoutQuote(dto: CheckoutQuoteDto) {
    return this.quoteService.create({
      customerId: dto.customerId,
      currencyId: dto.currencyId,
      validUntil: dto.validUntil,
      notes: dto.notes,
      lines: dto.lines,
    });
  }
}
