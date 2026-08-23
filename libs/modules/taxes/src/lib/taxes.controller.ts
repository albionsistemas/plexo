import { Body, Controller, Get, Param, Post, Query, StreamableFile } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import type { WithholdingTaxType } from '@plexo/database';
import { CreateTaxDefinitionDto } from './dto/create-tax-definition.dto.js';
import { CreateWithholdingRegimeDto } from './dto/create-withholding-regime.dto.js';
import { ReviseTaxDefinitionDto } from './dto/revise-tax-definition.dto.js';
import { ReviseWithholdingRegimeDto } from './dto/revise-withholding-regime.dto.js';
import { VatBookQueryDto } from './dto/vat-book-query.dto.js';
import { TaxesService } from './taxes.service.js';
import { VatBookExcelService } from './vat-book/vat-book-excel.service.js';
import { VatBookPdfService } from './vat-book/pdf/vat-book-pdf.service.js';
import { VatBookService } from './vat-book/vat-book.service.js';
import { WithholdingRegimeService } from './withholding-regime.service.js';

const MODULE = 'taxes';

@Controller('taxes')
export class TaxesController {
  constructor(
    private readonly taxesService: TaxesService,
    private readonly withholdingRegimeService: WithholdingRegimeService,
    private readonly vatBookService: VatBookService,
    private readonly vatBookExcelService: VatBookExcelService,
    private readonly vatBookPdfService: VatBookPdfService,
  ) {}

  @RequireModuleAccess(MODULE, 'write')
  @Post('definitions')
  createTaxDefinition(@Body() dto: CreateTaxDefinitionDto) {
    return this.taxesService.createTaxDefinition(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('definitions')
  listTaxDefinitions() {
    return this.taxesService.listTaxDefinitions();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('definitions/active')
  listActiveTaxDefinitions() {
    return this.taxesService.listActiveTaxDefinitions();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('definitions/:code/history')
  getTaxDefinitionHistory(@Param('code') code: string) {
    return this.taxesService.getTaxDefinitionHistory(code);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('definitions/revise')
  reviseTaxDefinition(@Body() dto: ReviseTaxDefinitionDto) {
    return this.taxesService.reviseTaxDefinition(dto);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('withholding-regimes')
  createWithholdingRegime(@Body() dto: CreateWithholdingRegimeDto) {
    return this.withholdingRegimeService.createRegime(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('withholding-regimes')
  listWithholdingRegimes() {
    return this.withholdingRegimeService.listRegimes();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('withholding-regimes/active')
  listActiveWithholdingRegimes(@Query('taxType') taxType?: WithholdingTaxType) {
    return this.withholdingRegimeService.listActiveRegimes(taxType);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('withholding-regimes/:code/history')
  getWithholdingRegimeHistory(@Param('code') code: string) {
    return this.withholdingRegimeService.getRegimeHistory(code);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('withholding-regimes/revise')
  reviseWithholdingRegime(@Body() dto: ReviseWithholdingRegimeDto) {
    return this.withholdingRegimeService.reviseRegime(dto);
  }

  // --- Libro IVA Ventas / Compras ---

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales')
  getSalesVatBook(@Query() query: VatBookQueryDto) {
    return this.vatBookService.getSalesBook(query.from, query.to);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases')
  getPurchasesVatBook(@Query() query: VatBookQueryDto) {
    return this.vatBookService.getPurchasesBook(query.from, query.to);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales/excel')
  async downloadSalesVatBookExcel(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getSalesBook(query.from, query.to);
    const buffer = await this.vatBookExcelService.generate(result);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="libro-iva-ventas_${result.from}_${result.to}.xlsx"`,
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases/excel')
  async downloadPurchasesVatBookExcel(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getPurchasesBook(query.from, query.to);
    const buffer = await this.vatBookExcelService.generate(result);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="libro-iva-compras_${result.from}_${result.to}.xlsx"`,
    });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/sales/pdf')
  async downloadSalesVatBookPdf(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getSalesBook(query.from, query.to);
    const { buffer, filename } = await this.vatBookPdfService.generate(result);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('vat-book/purchases/pdf')
  async downloadPurchasesVatBookPdf(@Query() query: VatBookQueryDto) {
    const result = await this.vatBookService.getPurchasesBook(query.from, query.to);
    const { buffer, filename } = await this.vatBookPdfService.generate(result);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }
}
