import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import type { PdfStyle, PurchaseDocumentStatus, PurchaseSendChannel } from '@plexo/database';
import type { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import type { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { PURCHASE_EMAIL_SENDER, type PurchaseEmailSender } from './email/purchase-email-sender.port.js';
import { buildPurchaseDocumentPdfData } from './pdf/build-pdf-data.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { PurchaseNumberingService } from './purchase-numbering.service.js';

// Exported so QuoteRequestService.convert() can return the same shape
// when it creates a PurchaseOrder - the frontend's send dialog needs
// supplier.id/name/email right off that response, not just `lines`.
export const PURCHASE_ORDER_DETAIL_INCLUDE = {
  lines: { include: { articleVariant: { include: { article: true } } } },
  supplier: { select: { id: true, name: true, taxId: true, email: true, fiscalAddress: true } },
  quoteRequest: { select: { id: true, number: true } },
  currency: true,
  transportMode: true,
  paymentTerm: true,
  deliveryTime: true,
  createdBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PurchaseOrderInclude;
const DETAIL_INCLUDE = PURCHASE_ORDER_DETAIL_INCLUDE;

const LIST_INCLUDE = {
  lines: true,
  supplier: { select: { id: true, name: true } },
  currency: { select: { code: true } },
} satisfies Prisma.PurchaseOrderInclude;

// See QuoteRequestListRow's comment - tsc needs an explicit, nameable
// return type to emit a .d.ts for this method.
export type PurchaseOrderListRow = Prisma.PurchaseOrderGetPayload<{ include: typeof LIST_INCLUDE }>;

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly numbering: PurchaseNumberingService,
    private readonly pdfGenerator: PdfGeneratorService,
    @Inject(PURCHASE_EMAIL_SENDER) private readonly emailSender: PurchaseEmailSender,
  ) {}

  list(status?: PurchaseDocumentStatus, supplierId?: string): Promise<PurchaseOrderListRow[]> {
    return getTenantDb().purchaseOrder.findMany({
      where: { status, supplierId },
      include: LIST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  get(id: string) {
    return this.findOrThrow(id);
  }

  async create(dto: CreatePurchaseOrderDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = requireUserId();

    await this.validateReferences(dto);
    const number = await this.numbering.nextNumber('purchaseOrder');
    const total = dto.lines.reduce(
      (sum, line) => sum.add(new Prisma.Decimal(line.unitCost).mul(line.quantity)),
      new Prisma.Decimal(0),
    );

    return db.purchaseOrder.create({
      data: {
        tenantId,
        number,
        supplierId: dto.supplierId,
        currencyId: dto.currencyId,
        transportModeId: dto.transportModeId,
        paymentTermId: dto.paymentTermId,
        deliveryTimeId: dto.deliveryTimeId,
        notes: dto.notes,
        total,
        createdByUserId: userId,
        lines: {
          createMany: {
            data: dto.lines.map((line) => ({
              tenantId,
              articleVariantId: line.articleVariantId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              notes: line.notes,
            })),
          },
        },
      },
      include: DETAIL_INCLUDE,
    });
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Purchase order not found');
    }
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only a DRAFT purchase order can be edited');
    }

    await this.validateReferences(dto);

    let total = existing.total;
    if (dto.lines) {
      total = dto.lines.reduce(
        (sum, line) => sum.add(new Prisma.Decimal(line.unitCost).mul(line.quantity)),
        new Prisma.Decimal(0),
      );
      await db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await db.purchaseOrderLine.createMany({
        data: dto.lines.map((line) => ({
          tenantId,
          purchaseOrderId: id,
          articleVariantId: line.articleVariantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          notes: line.notes,
        })),
      });
    }

    return db.purchaseOrder.update({
      where: { id },
      data: {
        supplierId: dto.supplierId,
        currencyId: dto.currencyId,
        transportModeId: dto.transportModeId,
        paymentTermId: dto.paymentTermId,
        deliveryTimeId: dto.deliveryTimeId,
        notes: dto.notes,
        total,
      },
      include: DETAIL_INCLUDE,
    });
  }

  async cancel(id: string) {
    const db = getTenantDb();
    const existing = await db.purchaseOrder.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Purchase order not found');
    }
    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('This purchase order is already cancelled');
    }
    return db.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  /** "Enviar por Email" in the send dialog - attaches the user's default
   * PDF style, marks sentAt/sentVia so the UI can show "Reenviar" instead
   * of "Enviar" afterward. */
  async sendEmail(id: string): Promise<void> {
    const purchaseOrder = await this.findOrThrow(id);
    if (!purchaseOrder.supplier.email) {
      throw new BadRequestException('This supplier has no email on file');
    }
    const { buffer, filename } = await this.generatePdf(id);
    await this.emailSender.sendPurchaseOrderEmail({
      to: purchaseOrder.supplier.email,
      purchaseOrderNumber: purchaseOrder.number,
      supplierName: purchaseOrder.supplier.name,
      total: purchaseOrder.total.toString(),
      currencyCode: purchaseOrder.currency.code,
      pdfBuffer: buffer,
      pdfFilename: filename,
    });
    await this.markSent(id, 'EMAIL');
  }

  /** Server-side text so wording stays in one place (mirrors invoicing's
   * overdue-email-templates.ts) - the frontend just opens
   * `https://wa.me/{phone}?text=...`. There's no delivery receipt for this:
   * "sent" means the user confirmed they went through with it (see
   * markSentWhatsapp), not a verified read/delivery status. */
  async buildWhatsappLink(id: string, phone: string): Promise<{ url: string }> {
    const purchaseOrder = await this.findOrThrow(id);
    const digitsOnly = phone.replace(/[^0-9]/g, '');
    if (!digitsOnly) {
      throw new BadRequestException('Invalid WhatsApp number');
    }
    const message =
      `Hola ${purchaseOrder.supplier.name}, te enviamos la Orden de Compra ` +
      `${purchaseOrder.number} por un total de ${purchaseOrder.currency.code} ${purchaseOrder.total.toString()}. ` +
      `Adjuntamos el PDF con el detalle.`;
    return { url: `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}` };
  }

  async markSentWhatsapp(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.markSent(id, 'WHATSAPP');
  }

  async generatePdf(id: string, style?: PdfStyle): Promise<{ buffer: Buffer; filename: string }> {
    const db = getTenantDb();
    const purchaseOrder = await this.findOrThrow(id);
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const resolvedStyle = style ?? (await this.resolveRequesterPdfStyle());

    const data = buildPurchaseDocumentPdfData(
      'Orden de Compra',
      {
        number: purchaseOrder.number,
        createdAt: purchaseOrder.createdAt,
        notes: purchaseOrder.notes,
        total: purchaseOrder.total,
        currency: purchaseOrder.currency,
        supplier: purchaseOrder.supplier,
        transportMode: purchaseOrder.transportMode,
        paymentTerm: purchaseOrder.paymentTerm,
        deliveryTime: purchaseOrder.deliveryTime,
        lines: purchaseOrder.lines,
      },
      tenant,
    );

    const buffer = await this.pdfGenerator.generate(resolvedStyle, data);
    return { buffer, filename: `${purchaseOrder.number}.pdf` };
  }

  private async findOrThrow(id: string) {
    const purchaseOrder = await getTenantDb().purchaseOrder.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!purchaseOrder) {
      throw new NotFoundException('Purchase order not found');
    }
    return purchaseOrder;
  }

  private async markSent(id: string, channel: PurchaseSendChannel): Promise<void> {
    await getTenantDb().purchaseOrder.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date(), sentVia: channel },
    });
  }

  private async resolveRequesterPdfStyle(): Promise<PdfStyle> {
    const userId = requireUserId();
    const user = await getTenantDb().user.findUniqueOrThrow({
      where: { id: userId },
      select: { purchaseDocumentPdfStyle: true },
    });
    return user.purchaseDocumentPdfStyle;
  }

  private async validateReferences(
    dto: Pick<
      CreatePurchaseOrderDto | UpdatePurchaseOrderDto,
      'supplierId' | 'currencyId' | 'transportModeId' | 'paymentTermId' | 'deliveryTimeId' | 'lines'
    >,
  ): Promise<void> {
    const db = getTenantDb();

    if (dto.supplierId) {
      const supplier = await db.company.findUnique({
        where: { id: dto.supplierId },
        include: { roles: true },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
      if (!supplier.active) {
        throw new BadRequestException('This supplier is inactive');
      }
      if (!supplier.roles.some((r) => r.role === 'SUPPLIER')) {
        throw new BadRequestException('This company is not flagged as a supplier');
      }
    }

    if (dto.currencyId) {
      const currency = await db.currency.findUnique({ where: { id: dto.currencyId } });
      if (!currency) {
        throw new NotFoundException('Currency not found');
      }
    }

    if (dto.transportModeId) {
      const found = await db.transportMode.findUnique({ where: { id: dto.transportModeId } });
      if (!found) {
        throw new NotFoundException('Transport mode not found');
      }
    }
    if (dto.paymentTermId) {
      const found = await db.paymentTerm.findUnique({ where: { id: dto.paymentTermId } });
      if (!found) {
        throw new NotFoundException('Payment term not found');
      }
    }
    if (dto.deliveryTimeId) {
      const found = await db.deliveryTime.findUnique({ where: { id: dto.deliveryTimeId } });
      if (!found) {
        throw new NotFoundException('Delivery time not found');
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
