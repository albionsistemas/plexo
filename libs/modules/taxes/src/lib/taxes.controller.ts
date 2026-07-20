import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { CreateTaxDefinitionDto } from './dto/create-tax-definition.dto.js';
import { ReviseTaxDefinitionDto } from './dto/revise-tax-definition.dto.js';
import { TaxesService } from './taxes.service.js';

const MODULE = 'taxes';

@Controller('taxes')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

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
}
