import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AuditEntity, PdfStyle, type PurchaseDocumentStatus } from '@plexo/database';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto.js';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto.js';
import { PurchaseOrderService } from './purchase-order.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

@Controller('purchases/purchase-orders')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Get()
  list(@Query('status') status?: PurchaseDocumentStatus, @Query('supplierId') supplierId?: string) {
    return this.purchaseOrderService.list(status, supplierId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrderService.get(id);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrderService.create(dto);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrderService.update(id, dto);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrderService.cancel(id);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/send-email')
  async sendEmail(@Param('id', ParseUUIDPipe) id: string) {
    await this.purchaseOrderService.sendEmail(id);
    return { sent: true };
  }

  @Get(':id/whatsapp-link')
  whatsappLink(@Param('id', ParseUUIDPipe) id: string, @Query('phone') phone: string) {
    return this.purchaseOrderService.buildWhatsappLink(id, phone);
  }

  @AuditEntity('purchaseOrder', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/mark-sent-whatsapp')
  async markSentWhatsapp(@Param('id', ParseUUIDPipe) id: string) {
    await this.purchaseOrderService.markSentWhatsapp(id);
    return { sent: true };
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('style', new ParseEnumPipe(PdfStyle, { optional: true })) style?: PdfStyle,
  ) {
    const { buffer, filename } = await this.purchaseOrderService.generatePdf(id, style);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
