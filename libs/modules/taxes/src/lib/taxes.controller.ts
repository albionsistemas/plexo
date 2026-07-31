import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import type { WithholdingTaxType } from '@plexo/database';
import { CreateTaxDefinitionDto } from './dto/create-tax-definition.dto.js';
import { CreateWithholdingRegimeDto } from './dto/create-withholding-regime.dto.js';
import { ReviseTaxDefinitionDto } from './dto/revise-tax-definition.dto.js';
import { ReviseWithholdingRegimeDto } from './dto/revise-withholding-regime.dto.js';
import { TaxesService } from './taxes.service.js';
import { WithholdingRegimeService } from './withholding-regime.service.js';

const MODULE = 'taxes';

@Controller('taxes')
export class TaxesController {
  constructor(
    private readonly taxesService: TaxesService,
    private readonly withholdingRegimeService: WithholdingRegimeService,
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
}
