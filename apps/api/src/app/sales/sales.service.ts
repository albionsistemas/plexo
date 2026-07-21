import { Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { InventoryService } from '@plexo/inventory';
import { InvoicingService } from '@plexo/invoicing';
import type { CreateSaleDto } from './dto/create-sale.dto.js';

/**
 * Composes InvoicingService + InventoryService + AccountingService for
 * what none of them owns alone: "issuing an invoice also moves stock and
 * posts the sale to the general ledger". Living here (not inside any of
 * those module libs) keeps them decoupled - if a second caller ever needs
 * the same composition, that's the signal to extract it behind a shared
 * port instead of duplicating this.
 *
 * Atomicity for all three writes comes for free: every service involved
 * reads/writes through getTenantDb(), which is the same per-request
 * transaction TenantContextInterceptor already opened - if any step
 * throws (insufficient stock, an unbalanced entry), the whole transaction
 * rolls back, including the invoice/lines created above it.
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly inventoryService: InventoryService,
    private readonly accountingService: AccountingService,
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

    await this.accountingService.postInvoiceJournalEntry({
      invoiceId: invoice.id,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      date: invoice.issueDate,
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
