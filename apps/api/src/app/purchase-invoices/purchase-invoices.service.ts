import { Injectable } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { Prisma } from '@plexo/database';
import {
  PurchaseInvoiceService,
  type CreatePurchaseInvoiceDto,
  type RecordSupplierPaymentDto,
} from '@plexo/purchases';

/**
 * Composes PurchaseInvoiceService (libs/modules/purchases - creates the
 * Factura de Compra itself and computes the GRNI split) with
 * AccountingService (posts the actual journal entry - clears the GRNI
 * bridge, books IVA Crédito/Percepciones, credits Proveedores; and, for
 * payments, debits Proveedores/credits Caja) - same shape as
 * GoodsReceiptsService/SupplierReturnsService. PurchaseInvoiceService
 * can't call AccountingService itself (this repo's rule: a lib module
 * never imports another module's Service), so this is the composition
 * root.
 *
 * Atomicity for free, same reason as the other composition roots:
 * everything runs through getTenantDb(), the same per-request transaction
 * - if the accounting call throws, the whole transaction rolls back,
 * including the PurchaseInvoice/SupplierPayment just created above.
 */
@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly purchaseInvoiceService: PurchaseInvoiceService,
    private readonly accountingService: AccountingService,
  ) {}

  list() {
    return this.purchaseInvoiceService.list();
  }

  get(id: string) {
    return this.purchaseInvoiceService.get(id);
  }

  /** Returns the invoice itself (not the {invoice, grniClearedAmount,
   * nonGrniAmount} wrapper PurchaseInvoiceService.create() returns) -
   * @AuditEntity('purchaseInvoice', {idParam: null}) on the controller
   * reads its `.id`/label off whatever this method returns, same lesson
   * already learned the hard way for QuoteRequestService.convert(). */
  async createInvoice(dto: CreatePurchaseInvoiceDto) {
    const { invoice, grniClearedAmount, nonGrniAmount } = await this.purchaseInvoiceService.create(dto);

    const ivaCredito = invoice.taxLines
      .filter((line) => line.type === 'IVA_CREDITO')
      .reduce((sum, line) => sum.add(line.amount), new Prisma.Decimal(0));
    const percepciones = invoice.taxLines
      .filter((line) => line.type === 'PERCEPCION')
      .map((line) => ({ concept: line.concept, amount: line.amount }));

    await this.accountingService.postPurchaseInvoiceJournalEntry({
      purchaseInvoiceId: invoice.id,
      grniClearedAmount,
      nonGrniAmount,
      ivaCredito,
      percepciones,
      total: invoice.total,
    });

    return invoice;
  }

  async recordPayment(invoiceId: string, dto: RecordSupplierPaymentDto) {
    const payment = await this.purchaseInvoiceService.recordPayment(invoiceId, dto);
    await this.accountingService.postSupplierPaymentJournalEntry({
      supplierPaymentId: payment.id,
      amount: payment.amount,
    });
    return payment;
  }
}
