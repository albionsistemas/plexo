import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  type Currency,
  type Customer,
  type DiscountType,
  type DocumentLetter,
  type Invoice,
  type InvoiceLine,
  type CreditNote,
  type ExchangeRateHistory,
  type Receipt,
  type TaxDefinition,
} from '@plexo/database';
import type { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import type { CreateCurrencyDto } from './dto/create-currency.dto.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import type { RecordExchangeRateDto } from './dto/record-exchange-rate.dto.js';
import type { RecordReceiptDto } from './dto/record-receipt.dto.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.port.js';
import { ELECTRONIC_INVOICING, type ElectronicInvoicingPort } from './electronic-invoicing.port.js';

type InvoiceWithLines = Invoice & { lines: InvoiceLine[] };

interface LineCalculation {
  articleVariantId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountType: DiscountType;
  discountValue: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
}

@Injectable()
export class InvoicingService {
  constructor(
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
    @Inject(ELECTRONIC_INVOICING)
    private readonly electronicInvoicing: ElectronicInvoicingPort,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  createCustomer(dto: CreateCustomerDto): Promise<Customer> {
    return getTenantDb().customer.create({
      data: {
        tenantId: getTenantId(),
        name: dto.name,
        taxId: dto.taxId,
        email: dto.email,
        creditLimit: dto.creditLimit ?? 0,
      },
    });
  }

  listCustomers(): Promise<Customer[]> {
    return getTenantDb().customer.findMany({ orderBy: { name: 'asc' } });
  }

  createCurrency(dto: CreateCurrencyDto): Promise<Currency> {
    return getTenantDb().currency.create({
      data: {
        tenantId: getTenantId(),
        code: dto.code,
        name: dto.name,
        isBase: dto.isBase ?? false,
      },
    });
  }

  listCurrencies(): Promise<Currency[]> {
    return getTenantDb().currency.findMany({ orderBy: { code: 'asc' } });
  }

  recordExchangeRate(dto: RecordExchangeRateDto): Promise<ExchangeRateHistory> {
    return getTenantDb().exchangeRateHistory.create({
      data: { tenantId: getTenantId(), currencyId: dto.currencyId, rate: dto.rate },
    });
  }

  listInvoices(): Promise<InvoiceWithLines[]> {
    return getTenantDb().invoice.findMany({
      include: { lines: true },
      orderBy: { issueDate: 'desc' },
    });
  }

  async getInvoice(id: string): Promise<InvoiceWithLines> {
    const invoice = await getTenantDb().invoice.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  /**
   * Strict calculation order (do not reorder without re-reading the
   * commit that introduced this - it exists to keep multi-rate tax
   * allocation correct once a global discount is in the mix):
   *   1. unit price (USD, converted to the invoice currency) x quantity
   *   2. apply the line's own discount -> each line's net amount
   *   3. subtotal = sum of line net amounts
   *   4. apply globalDiscountPercent to that subtotal, distributed back
   *      across lines proportionally to their share of it (needed because
   *      lines can carry different tax rates - discounting "the total"
   *      and taxing "the total" would misallocate tax across rates)
   *   5. tax each line's post-global-discount amount, sum for taxTotal
   *
   * Does not touch stock - see SalesService (apps/api) for why that's
   * composed at the app layer instead of being called from here.
   */
  async createInvoice(dto: CreateInvoiceDto): Promise<InvoiceWithLines> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const issuedByUserId = getUserId();
    if (!issuedByUserId) {
      throw new BadRequestException('An authenticated user is required to issue an invoice');
    }

    const customer = await db.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const currency = await db.currency.findUnique({ where: { id: dto.currencyId } });
    if (!currency) {
      throw new NotFoundException('Currency not found');
    }

    const exchangeRate = await this.resolveExchangeRate(currency);
    const globalDiscountPercent = new Prisma.Decimal(dto.globalDiscountPercent ?? 0);

    const lineCalculations: LineCalculation[] = [];
    let subtotal = new Prisma.Decimal(0);

    for (const line of dto.lines) {
      const variant = await db.articleVariant.findUnique({
        where: { id: line.articleVariantId },
        include: { article: { include: { taxDefinition: true } } },
      });
      if (!variant) {
        throw new NotFoundException(`Article variant ${line.articleVariantId} not found`);
      }

      const quantity = new Prisma.Decimal(line.quantity);
      const unitPrice = variant.unitPrice.mul(exchangeRate);
      const grossAmount = unitPrice.mul(quantity);

      const discountType: DiscountType = line.discountType ?? 'PERCENTAGE';
      const discountValue = new Prisma.Decimal(line.discountValue ?? 0);
      const discountAmount =
        discountType === 'PERCENTAGE'
          ? grossAmount.mul(discountValue).div(100)
          : discountValue;
      const netAmount = grossAmount.sub(discountAmount);
      const taxRate = this.resolveTaxRate(variant.article.taxDefinition);

      subtotal = subtotal.add(netAmount);
      lineCalculations.push({
        articleVariantId: variant.id,
        quantity,
        unitPrice,
        discountType,
        discountValue,
        netAmount,
        taxRate,
      });
    }

    const globalDiscountAmount = subtotal.mul(globalDiscountPercent).div(100);
    let taxTotal = new Prisma.Decimal(0);
    const lineInputs: Prisma.InvoiceLineCreateManyInvoiceInput[] = [];

    for (const calc of lineCalculations) {
      const share = subtotal.isZero() ? new Prisma.Decimal(0) : calc.netAmount.div(subtotal);
      const lineGlobalDiscount = globalDiscountAmount.mul(share);
      const afterGlobalDiscount = calc.netAmount.sub(lineGlobalDiscount);
      const lineTax = afterGlobalDiscount.mul(calc.taxRate).div(100);
      taxTotal = taxTotal.add(lineTax);

      lineInputs.push({
        tenantId,
        articleVariantId: calc.articleVariantId,
        quantity: calc.quantity,
        unitPrice: calc.unitPrice,
        discountType: calc.discountType,
        discountValue: calc.discountValue,
        netAmount: calc.netAmount,
        taxRate: calc.taxRate,
        lineTotal: afterGlobalDiscount.add(lineTax),
      });
    }

    const netSubtotal = subtotal.sub(globalDiscountAmount);
    const total = netSubtotal.add(taxTotal);
    const number = await this.nextInvoiceNumber(dto.pointOfSale, dto.documentLetter);

    const created = await db.invoice.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        customerName: customer.name,
        customerTaxId: customer.taxId,
        documentLetter: dto.documentLetter,
        pointOfSale: dto.pointOfSale,
        number,
        status: 'ISSUED',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        currencyId: dto.currencyId,
        exchangeRate,
        globalDiscountPercent,
        subtotal: netSubtotal,
        taxTotal,
        total,
        balanceDue: total,
        issuedByUserId,
        lines: { createMany: { data: lineInputs } },
      },
      include: { lines: true },
    });

    const { cae, caeExpiry } = await this.electronicInvoicing.requestCae({
      number: created.number,
      total: created.total,
    });

    const finalInvoice = await db.invoice.update({
      where: { id: created.id },
      data: { afipCae: cae, afipCaeExpiry: caeExpiry },
      include: { lines: true },
    });

    if (customer.email) {
      await this.emailSender.sendInvoiceEmail({
        to: customer.email,
        invoiceNumber: `${dto.pointOfSale}-${finalInvoice.number}`,
        total: finalInvoice.total.toFixed(2),
      });
    }

    this.eventEmitter.emit('invoice.created', {
      tenantId: finalInvoice.tenantId,
      invoiceId: finalInvoice.id,
      total: finalInvoice.total.toString(),
      customerName: finalInvoice.customerName,
      status: finalInvoice.status,
      issueDate: finalInvoice.issueDate.toISOString(),
    });

    return finalInvoice;
  }

  /** v1: full reversal only - see CreateCreditNoteDto for why partial
   * credit notes are out of scope here. */
  async createCreditNote(dto: CreateCreditNoteDto): Promise<CreditNote> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const issuedByUserId = getUserId();
    if (!issuedByUserId) {
      throw new BadRequestException('An authenticated user is required to issue a credit note');
    }

    const invoice = await db.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (!invoice.afipCae) {
      throw new BadRequestException('Cannot credit an invoice that has not been issued yet');
    }

    const number = await this.nextCreditNoteNumber(invoice.pointOfSale, invoice.documentLetter);

    const created = await db.creditNote.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        documentLetter: invoice.documentLetter,
        pointOfSale: invoice.pointOfSale,
        number,
        reason: dto.reason,
        currencyId: invoice.currencyId,
        exchangeRate: invoice.exchangeRate,
        subtotal: invoice.subtotal,
        taxTotal: invoice.taxTotal,
        total: invoice.total,
        issuedByUserId,
      },
    });

    const { cae, caeExpiry } = await this.electronicInvoicing.requestCae({
      number: created.number,
      total: created.total,
    });

    return db.creditNote.update({
      where: { id: created.id },
      data: { afipCae: cae, afipCaeExpiry: caeExpiry },
    });
  }

  async recordReceipt(dto: RecordReceiptDto): Promise<Receipt> {
    const db = getTenantDb();
    const tenantId = getTenantId();

    const invoice = await db.invoice.findUnique({ where: { id: dto.invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (amount.gt(invoice.balanceDue)) {
      throw new BadRequestException('Receipt amount exceeds the invoice balance due');
    }

    const receipt = await db.receipt.create({
      data: {
        tenantId,
        invoiceId: dto.invoiceId,
        amount,
        method: dto.method,
        financialAccountId: dto.financialAccountId,
      },
    });

    const balanceDue = invoice.balanceDue.sub(amount);
    const stillOverdue = Boolean(invoice.dueDate && invoice.dueDate < new Date());
    await db.invoice.update({
      where: { id: dto.invoiceId },
      data: {
        balanceDue,
        status: balanceDue.isZero()
          ? 'PAID'
          : stillOverdue
            ? 'OVERDUE'
            : 'PARTIALLY_PAID',
      },
    });

    return receipt;
  }

  /**
   * Called by ReceivablesSchedulerService (apps/api) once per invoice that
   * ReceivablesService.listInvoicesBecomingOverdue() found - keeps the
   * EMAIL_SENDER port encapsulated in this module (it's not exported)
   * instead of every caller needing to know the token exists.
   */
  async sendOverdueInvoiceAlert(
    invoice: Pick<Invoice, 'documentLetter' | 'number' | 'balanceDue' | 'dueDate'>,
    customerEmail: string,
  ): Promise<void> {
    await this.emailSender.sendOverdueAlertEmail({
      to: customerEmail,
      invoiceNumber: `${invoice.documentLetter}-${invoice.number}`,
      balanceDue: invoice.balanceDue.toFixed(2),
      dueDate: invoice.dueDate?.toLocaleDateString('es-AR') ?? '',
    });
  }

  private async resolveExchangeRate(currency: Currency): Promise<Prisma.Decimal> {
    if (currency.isBase) {
      return new Prisma.Decimal(1);
    }
    const latest = await getTenantDb().exchangeRateHistory.findFirst({
      where: { currencyId: currency.id },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!latest) {
      throw new BadRequestException(`No exchange rate on file for currency ${currency.code}`);
    }
    return latest.rate;
  }

  private resolveTaxRate(taxDefinition: TaxDefinition | null): Prisma.Decimal {
    if (!taxDefinition) {
      return new Prisma.Decimal(0);
    }
    if (taxDefinition.calculationType === 'FORMULA') {
      // Not evaluated here on purpose - a formula-based tax needs a
      // vetted, sandboxed evaluator (never eval()/new Function() over
      // tenant-supplied text) before it's safe to run against real
      // invoices. See the module README note on TaxDefinition for the
      // recommended design.
      throw new BadRequestException(
        `Tax definition ${taxDefinition.code} uses FORMULA, which isn't wired up yet`,
      );
    }
    if (taxDefinition.calculationType === 'FIXED_AMOUNT') {
      // Not a %, so it can't share this "rate over line amount" math -
      // needs its own additive code path before it's safe to support.
      throw new BadRequestException(
        `Tax definition ${taxDefinition.code} uses FIXED_AMOUNT, which isn't wired up yet`,
      );
    }
    return taxDefinition.rate ?? new Prisma.Decimal(0);
  }

  /**
   * NOT race-free under concurrent invoice creation for the same
   * (tenant, pointOfSale, documentLetter): two requests can both count N
   * and try to insert N+1, and the second collides with the
   * @@unique([tenantId, documentLetter, pointOfSale, number]) constraint
   * (that request fails cleanly and can be retried, it doesn't corrupt
   * data). Proper AFIP point-of-sale numbering needs its own sequence
   * anyway once the real WSFE integration replaces this stub.
   */
  private async nextInvoiceNumber(
    pointOfSale: string,
    documentLetter: DocumentLetter,
  ): Promise<string> {
    const count = await getTenantDb().invoice.count({ where: { pointOfSale, documentLetter } });
    return String(count + 1).padStart(8, '0');
  }

  private async nextCreditNoteNumber(
    pointOfSale: string,
    documentLetter: DocumentLetter,
  ): Promise<string> {
    const count = await getTenantDb().creditNote.count({ where: { pointOfSale, documentLetter } });
    return String(count + 1).padStart(8, '0');
  }
}
