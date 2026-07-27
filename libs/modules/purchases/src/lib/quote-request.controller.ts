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
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto.js';
import { UpdateQuoteRequestDto } from './dto/update-quote-request.dto.js';
import { QuoteRequestService } from './quote-request.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

@Controller('purchases/quote-requests')
export class QuoteRequestController {
  constructor(private readonly quoteRequestService: QuoteRequestService) {}

  @Get()
  list(@Query('status') status?: PurchaseDocumentStatus, @Query('supplierId') supplierId?: string) {
    return this.quoteRequestService.list(status, supplierId);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.get(id);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateQuoteRequestDto) {
    return this.quoteRequestService.create(dto);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQuoteRequestDto) {
    return this.quoteRequestService.update(id, dto);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/clone')
  clone(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.clone(id);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Post(':id/convert')
  convert(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.convert(id);
  }

  @AuditEntity('quoteRequest', { labelFields: ['number'] })
  @Roles(...WRITE_ROLES)
  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.quoteRequestService.cancel(id);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('style', new ParseEnumPipe(PdfStyle, { optional: true })) style?: PdfStyle,
  ) {
    const { buffer, filename } = await this.quoteRequestService.generatePdf(id, style);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
