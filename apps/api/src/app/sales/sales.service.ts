import { Injectable } from '@nestjs/common';
import { InventoryService } from '@plexo/inventory';
import { InvoicingService } from '@plexo/invoicing';
import type { CreateSaleDto } from './dto/create-sale.dto.js';

/**
 * Composes InvoicingService + InventoryService for the one thing neither
 * owns alone: "issuing an invoice also moves stock". Living here (not
 * inside either module lib) keeps invoicing and inventory decoupled - if a
 * second caller ever needs the same "decrement stock on sale" behavior,
 * that's the signal to extract it behind a shared port instead of
 * duplicating this composition.
 *
 * Atomicity for both writes comes for free: InvoicingService and
 * InventoryService both read/write through getTenantDb(), which is the
 * same per-request transaction TenantContextInterceptor already opened -
 * if recordMovement() throws (insufficient stock), the whole transaction
 * rolls back, including the invoice/lines just created above it.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly inventoryService: InventoryService,
  ) {}

  async createSale(dto: CreateSaleDto) {
    const invoice = await this.invoicingService.createInvoice({
      customerId: dto.customerId,
      documentLetter: dto.documentLetter,
      pointOfSale: dto.pointOfSale,
      currencyId: dto.currencyId,
      globalDiscountPercent: dto.globalDiscountPercent,
      dueDate: dto.dueDate,
      lines: dto.lines,
    });

    for (const line of invoice.lines) {
      await this.inventoryService.recordMovement({
        warehouseId: dto.warehouseId,
        articleVariantId: line.articleVariantId,
        type: 'SALE_OUT',
        quantity: line.quantity.toNumber(),
        invoiceId: invoice.id,
        sourceType: 'INVOICE',
        sourceId: invoice.id,
      });
    }

    return invoice;
  }
}
