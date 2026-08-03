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
import { AuditEntity, PdfStyle, type QuoteStatus } from '@plexo/database';
import { CreateQuoteDto } from './dto/create-quote.dto.js';
import { UpdateQuoteDto } from './dto/update-quote.dto.js';
import { QuoteService } from './quote.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('quotes')
export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  @Get()
  list(@Query('status') status?: QuoteStatus, @Query('customerId') customerId?: string) {
    return this.quoteService.list(status, customerId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteService.get(id);
  }

  // idParam: null - see the identical comment on QuoteRequestController.create().
  @AuditEntity('quote', { labelFields: ['number'], idParam: null })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateQuoteDto) {
    return this.quoteService.create(dto);
  }

  @AuditEntity('quote', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteDto) {
    return this.quoteService.update(id, dto);
  }

  @AuditEntity('quote', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteService.cancel(id);
  }

  @AuditEntity('quote', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteService.accept(id);
  }

  @AuditEntity('quote', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteService.reject(id);
  }

  // Returns the updated Quote itself (not a bare {sent:true}) so the audit
  // log's diff actually reflects what changed (status/sentAt/sentVia) - see
  // the identical comment on PurchaseOrderController.sendEmail.
  @AuditEntity('quote', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/send-email')
  sendEmail(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteService.sendEmail(id);
  }

  @Get(':id/whatsapp-link')
  whatsappLink(@Param('id', ParseUUIDPipe) id: string, @Query('phone') phone: string) {
    return this.quoteService.buildWhatsappLink(id, phone);
  }

  @AuditEntity('quote', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/mark-sent-whatsapp')
  markSentWhatsapp(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteService.markSentWhatsapp(id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('style', new ParseEnumPipe(PdfStyle, { optional: true })) style?: PdfStyle,
  ) {
    const { buffer, filename } = await this.quoteService.generatePdf(id, style);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
