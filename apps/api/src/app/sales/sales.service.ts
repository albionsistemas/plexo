import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { InvoicingService, type CreateCreditNoteDto } from '@plexo/invoicing';
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
    const branch = await getTenantDb().company.findUnique({
      where: { id: dto.branchId },
      include: { roles: true },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    if (!branch.active) {
      throw new BadRequestException('This branch is inactive');
    }
    if (!branch.roles.some((r) => r.role === 'BRANCH')) {
      throw new BadRequestException('This company is not flagged as a branch');
    }
    if (!branch.pointOfSaleNumber) {
      throw new BadRequestException('Branch has no pointOfSaleNumber configured');
    }

    const invoice = await this.invoicingService.createInvoice({
      customerId: dto.customerId,
      documentLetter: dto.documentLetter,
      pointOfSale: branch.pointOfSaleNumber,
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

  /**
   * Composes InvoicingService.createCreditNote + the matching GL reversal
   * + a stock restock, same transaction/atomicity story as createSale().
   * This is the only place a credit note gets created (InvoicingController
   * no longer exposes its own POST /invoicing/credit-notes) specifically
   * so there's no path that credits an invoice without also reversing its
   * journal entry and restocking - see the recordMovement() doc comment in
   * InventoryService for why the analogous "SALE_OUT without an invoice"
   * gap was left as a manual step instead: there, the caller has no
   * journal entry/stock movement to reverse in the first place. Here it
   * does, so there's no excuse not to close the loop.
   *
   * Restock reads back the original SALE_OUT StockMovement rows for this
   * invoice (warehouseId + quantity per line) instead of re-deriving them
   * from the invoice lines, since the invoice itself doesn't know which
   * warehouse each line came out of - only the movement does. A RETURN
   * per original SALE_OUT keeps the ledger symmetric with how the sale
   * removed it. CreateCreditNoteDto is "full reversal only" (v1), so this
   * always restocks every line of the invoice, never a partial return.
   */
  async voidSale(dto: CreateCreditNoteDto) {
    const creditNote = await this.invoicingService.createCreditNote(dto);
    await this.accountingService.reverseInvoiceJournalEntry(dto.invoiceId);

    const saleMovements = await getTenantDb().stockMovement.findMany({
      where: { invoiceId: dto.invoiceId, type: 'SALE_OUT' },
    });
    for (const movement of saleMovements) {
      await this.inventoryService.recordMovement({
        warehouseId: movement.warehouseId,
        articleVariantId: movement.articleVariantId,
        type: 'RETURN',
        quantity: movement.quantity.toNumber(),
        invoiceId: dto.invoiceId,
        sourceType: 'CREDIT_NOTE',
        sourceId: creditNote.id,
      });
    }

    return creditNote;
  }
}
