import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb, Prisma } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { InvoicingService, type CreateCreditNoteDto } from '@plexo/invoicing';
import { resolveEmailFrom, TenantSettingsService } from '@plexo/tenant-settings';
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
    private readonly tenantSettingsService: TenantSettingsService,
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

    const settings = await this.tenantSettingsService.getSettings();
    const invoice = await this.invoicingService.createInvoice(
      {
        customerId: dto.customerId,
        documentLetter: dto.documentLetter,
        pointOfSale: branch.pointOfSaleNumber,
        currencyId: dto.currencyId,
        globalDiscountPercent: dto.globalDiscountPercent,
        dueDate: dto.dueDate,
        lines: dto.lines,
      },
      resolveEmailFrom(settings),
    );

    // Inventory has to run before accounting now (used to be the other way
    // around): the COGS lines below need each SALE_OUT movement's stamped
    // unitCost (the weighted-average cost consumed at that moment), which
    // only exists once recordMovement() has run.
    let totalCogs = new Prisma.Decimal(0);
    for (const line of invoice.lines) {
      const movement = await this.inventoryService.recordMovement({
        warehouseId: dto.warehouseId,
        articleVariantId: line.articleVariantId,
        type: 'SALE_OUT',
        quantity: line.quantity.toNumber(),
        invoiceId: invoice.id,
        invoiceLineId: line.id,
        sourceType: 'INVOICE',
        sourceId: invoice.id,
      });
      if (movement.unitCost != null) {
        totalCogs = totalCogs.add(new Prisma.Decimal(movement.unitCost).mul(line.quantity));
      }
    }

    await this.accountingService.postInvoiceJournalEntry({
      invoiceId: invoice.id,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      total: invoice.total,
      date: invoice.issueDate,
      cogsAmount: totalCogs,
    });

    return invoice;
  }

  /**
   * Composes InvoicingService.createCreditNote + its own journal entry +
   * a stock restock, same transaction/atomicity story as createSale(). This
   * is the only place a credit note gets created (InvoicingController no
   * longer exposes its own POST /invoicing/credit-notes) specifically so
   * there's no path that credits an invoice without also posting the
   * matching entry and restocking - see the recordMovement() doc comment
   * in InventoryService for why the analogous "SALE_OUT without an
   * invoice" gap was left as a manual step instead: there, the caller has
   * no journal entry/stock movement to correct in the first place. Here it
   * does, so there's no excuse not to close the loop.
   *
   * Credit notes are per-line/per-quantity now (createCreditNote enforces
   * a line never gets credited past its original quantity, across every
   * credit note ever issued against the invoice) - crediting every line's
   * full quantity in one call reproduces what used to be the only option
   * ("full reversal"), same code path, nothing special-cased for it.
   *
   * Restock/COGS per credited line reads back the ORIGINAL SALE_OUT
   * StockMovement by invoiceLineId (for warehouseId + the unitCost it was
   * sold at) instead of re-deriving them from the invoice - the invoice
   * itself doesn't know which warehouse a line came out of, only the
   * movement does. A line with no matching original movement (e.g. a
   * future non-stock/service line) is skipped for both restock and COGS -
   * never blocks the credit note, never fabricates a cost.
   */
  async voidSale(dto: CreateCreditNoteDto) {
    const creditNote = await this.invoicingService.createCreditNote(dto);

    const db = getTenantDb();
    const restocks: {
      creditNoteLineId: string;
      warehouseId: string;
      articleVariantId: string;
      invoiceLineId: string;
      quantity: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
    }[] = [];
    let totalCogs = new Prisma.Decimal(0);

    for (const creditNoteLine of creditNote.lines) {
      const original = await db.stockMovement.findFirst({
        where: { invoiceLineId: creditNoteLine.invoiceLineId, type: 'SALE_OUT' },
      });
      if (!original) {
        continue;
      }
      restocks.push({
        creditNoteLineId: creditNoteLine.id,
        warehouseId: original.warehouseId,
        articleVariantId: original.articleVariantId,
        invoiceLineId: creditNoteLine.invoiceLineId,
        quantity: creditNoteLine.quantity,
        unitCost: original.unitCost,
      });
      if (original.unitCost != null) {
        totalCogs = totalCogs.add(original.unitCost.mul(creditNoteLine.quantity));
      }
    }

    await this.accountingService.postCreditNoteJournalEntry({
      creditNoteId: creditNote.id,
      invoiceId: dto.invoiceId,
      subtotal: creditNote.subtotal,
      taxTotal: creditNote.taxTotal,
      total: creditNote.total,
      date: creditNote.issueDate,
      cogsAmount: totalCogs,
    });

    for (const restock of restocks) {
      await this.inventoryService.recordMovement({
        warehouseId: restock.warehouseId,
        articleVariantId: restock.articleVariantId,
        type: 'RETURN',
        quantity: restock.quantity.toNumber(),
        // Re-weights the returned stock back in at the cost it was sold
        // at, so the average doesn't just silently drop the cost trail -
        // undefined (not 0) when the original sale had no cost basis, so
        // recordMovement leaves the average untouched rather than
        // polluting it with a fabricated zero cost.
        unitCost: restock.unitCost != null ? restock.unitCost.toNumber() : undefined,
        invoiceId: dto.invoiceId,
        invoiceLineId: restock.invoiceLineId,
        sourceType: 'CREDIT_NOTE',
        sourceId: creditNote.id,
      });
    }

    return creditNote;
  }
}
