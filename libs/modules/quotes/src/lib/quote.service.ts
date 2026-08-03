import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { PdfStyle, QuoteSendChannel, QuoteStatus } from '@plexo/database';
import type { CreateQuoteDto } from './dto/create-quote.dto.js';
import type { UpdateQuoteDto } from './dto/update-quote.dto.js';
import { QUOTE_EMAIL_SENDER, type QuoteEmailSender } from './email/quote-email-sender.port.js';
import { buildQuotePdfData } from './pdf/build-pdf-data.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { QuoteNumberingService } from './quote-numbering.service.js';

const DETAIL_INCLUDE = {
  lines: { include: { articleVariant: { include: { article: true } } } },
  customer: { select: { id: true, name: true, taxId: true, email: true, fiscalAddress: true } },
  currency: true,
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.QuoteInclude;

const LIST_INCLUDE = {
  lines: true,
  customer: { select: { id: true, name: true, email: true } },
  currency: { select: { code: true } },
} satisfies Prisma.QuoteInclude;

export type QuoteListRow = Prisma.QuoteGetPayload<{ include: typeof LIST_INCLUDE }>;
export type QuoteDetail = Prisma.QuoteGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * "Cotización" - a sales-side proposal to a customer, mirroring
 * @plexo/purchases' PurchaseOrderService (single-document lifecycle: no
 * separate "request → order" split like QuoteRequest/PurchaseOrder has,
 * since a customer-facing quote doesn't need that internal working-draft
 * step). DRAFT -> SENT (email/WhatsApp) -> ACCEPTED/REJECTED (the
 * customer's decision, recorded by hand) or CANCELLED at any point before
 * a decision.
 */
@Injectable()
export class QuoteService {
  constructor(
    private readonly numbering: QuoteNumberingService,
    private readonly pdfGenerator: PdfGeneratorService,
    @Inject(QUOTE_EMAIL_SENDER) private readonly emailSender: QuoteEmailSender,
  ) {}

  list(status?: QuoteStatus, customerId?: string): Promise<QuoteListRow[]> {
    return getTenantDb().quote.findMany({
      where: { status, customerId },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string): Promise<QuoteDetail> {
    return this.findOrThrow(id);
  }

  async create(dto: CreateQuoteDto): Promise<QuoteDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = requireUserId();

    await this.validateReferences(dto);
    const number = await this.numbering.nextNumber();
    const total = dto.lines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
      new Prisma.Decimal(0),
    );

    return db.quote.create({
      data: {
        tenantId,
        number,
        customerId: dto.customerId,
        currencyId: dto.currencyId,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        total,
        createdByUserId: userId,
        lines: {
          createMany: {
            data: dto.lines.map((line) => ({
              tenantId,
              articleVariantId: line.articleVariantId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              notes: line.notes,
            })),
          },
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateQuoteDto): Promise<QuoteDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const existing = await db.quote.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Quote not found');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a DRAFT quote can be edited');
    }

    await this.validateReferences(dto);

    let total = existing.total;
    if (dto.lines) {
      total = dto.lines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.unitPrice).mul(line.quantity)),
        new Prisma.Decimal(0),
      );
      await db.quoteLine.deleteMany({ where: { quoteId: id } });
      await db.quoteLine.createMany({
        data: dto.lines.map((line) => ({
          tenantId,
          quoteId: id,
          articleVariantId: line.articleVariantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          notes: line.notes,
        })),
      });
    }

    return db.quote.update({
      where: { id },
      data: {
        customerId: dto.customerId,
        currencyId: dto.currencyId,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        total,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async cancel(id: string): Promise<QuoteDetail> {
    const existing = await this.findOrThrow(id);
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('This quote is already cancelled');
    }
    return getTenantDb().quote.update({ where: { id }, data: { status: 'CANCELLED' }, include: DETAIL_INCLUDE });
  }

  /** The customer's decision, recorded by hand - there's no automated
   * customer-facing acceptance flow (no portal), so this is always someone
   * on our side entering what the customer told them. Only meaningful once
   * the quote has actually been sent. */
  async accept(id: string): Promise<QuoteDetail> {
    return this.resolveDecision(id, 'ACCEPTED');
  }

  async reject(id: string): Promise<QuoteDetail> {
    return this.resolveDecision(id, 'REJECTED');
  }

  private async resolveDecision(id: string, status: 'ACCEPTED' | 'REJECTED'): Promise<QuoteDetail> {
    const existing = await this.findOrThrow(id);
    if (existing.status !== 'SENT') {
      throw new BadRequestException('Only a SENT quote can be accepted or rejected');
    }
    return getTenantDb().quote.update({ where: { id }, data: { status }, include: DETAIL_INCLUDE });
  }

  /** "Enviar por Email" - attaches the user's default PDF style, marks
   * sentAt/sentVia so the UI can show "Reenviar" instead of "Enviar"
   * afterward. Mirrors PurchaseOrderService.sendEmail exactly. */
  async sendEmail(id: string): Promise<QuoteDetail> {
    const quote = await this.findOrThrow(id);
    if (!quote.customer.email) {
      throw new BadRequestException('This customer has no email on file');
    }
    const { buffer, filename } = await this.generatePdf(id);
    await this.emailSender.sendQuoteEmail({
      to: quote.customer.email,
      quoteNumber: quote.number,
      customerName: quote.customer.name,
      total: quote.total.toString(),
      currencyCode: quote.currency.code,
      pdfBuffer: buffer,
      pdfFilename: filename,
    });
    return this.markSent(id, 'EMAIL');
  }

  /** Same "no delivery receipt" semantics as PurchaseOrderService.
   * buildWhatsappLink - the frontend just opens
   * `https://wa.me/{phone}?text=...`; "sent" means the user confirmed it
   * (see markSentWhatsapp), not a verified read/delivery status. */
  async buildWhatsappLink(id: string, phone: string): Promise<{ url: string }> {
    const quote = await this.findOrThrow(id);
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      throw new BadRequestException('Invalid WhatsApp number');
    }
    const message =
      `Hola ${quote.customer.name}, te enviamos la Cotización ` +
      `${quote.number} por un total de ${quote.currency.code} ${quote.total.toString()}. ` +
      `Adjuntamos el PDF con el detalle.`;
    return { url: `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}` };
  }

  async markSentWhatsapp(id: string): Promise<QuoteDetail> {
    await this.findOrThrow(id);
    return this.markSent(id, 'WHATSAPP');
  }

  async generatePdf(id: string, style?: PdfStyle): Promise<{ buffer: Buffer; filename: string }> {
    const db = getTenantDb();
    const quote = await this.findOrThrow(id);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const resolvedStyle = style ?? (await this.resolveRequesterPdfStyle());

    const data = buildQuotePdfData(
      {
        number: quote.number,
        createdAt: quote.createdAt,
        validUntil: quote.validUntil,
        notes: quote.notes,
        total: quote.total,
        currency: quote.currency,
        customer: quote.customer,
        lines: quote.lines,
      },
      tenant,
    );

    const buffer = await this.pdfGenerator.generate(resolvedStyle, data);
    return { buffer, filename: `${quote.number}.pdf` };
  }

  private async findOrThrow(id: string): Promise<QuoteDetail> {
    const quote = await getTenantDb().quote.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!quote) {
      throw new NotFoundException('Quote not found');
    }
    return quote;
  }

  private markSent(id: string, channel: QuoteSendChannel): Promise<QuoteDetail> {
    return getTenantDb().quote.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentVia: channel },
      include: DETAIL_INCLUDE,
    });
  }

  private async resolveRequesterPdfStyle(): Promise<PdfStyle> {
    const userId = requireUserId();
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { quotePdfStyle: true },
    });
    return user.quotePdfStyle;
  }

  private async validateReferences(
    dto: Pick<CreateQuoteDto | UpdateQuoteDto, 'customerId' | 'currencyId' | 'lines'>,
  ): Promise<void> {
    const db = getTenantDb();

    if (dto.customerId) {
      const customer = await db.company.findUnique({
        where: { id: dto.customerId },
        include: { roles: true },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.active) {
        throw new BadRequestException('This customer is inactive');
      }
      if (!customer.roles.some((r) => r.role === 'CUSTOMER')) {
        throw new BadRequestException('This company is not flagged as a customer');
      }
    }

    if (dto.currencyId) {
      const currency = await db.currency.findUnique({ where: { id: dto.currencyId } });
      if (!currency) {
        throw new NotFoundException('Currency not found');
      }
    }

    if (dto.lines) {
      for (const line of dto.lines) {
        const variant = await db.articleVariant.findUnique({ where: { id: line.articleVariantId } });
        if (!variant) {
          throw new NotFoundException(`Article variant ${line.articleVariantId} not found`);
        }
      }
    }
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}
