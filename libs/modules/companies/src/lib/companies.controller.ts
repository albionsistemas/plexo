import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '@plexo/auth';
import type { CompanyRoleType } from '@plexo/database';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { CreatePersonDto } from './dto/create-person.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { UpdatePersonDto } from './dto/update-person.dto.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Roles(...WRITE_ROLES)
  @Post()
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(dto);
  }

  @Get()
  listCompanies(
    @Query('role') role?: CompanyRoleType,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.companiesService.listCompanies(role, includeInactive === 'true');
  }

  @Roles(...WRITE_ROLES)
  @Post('people')
  createPerson(@Body() dto: CreatePersonDto) {
    return this.companiesService.createPerson(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch('people/:id')
  updatePerson(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePersonDto) {
    return this.companiesService.updatePerson(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @HttpCode(204)
  @Delete('people/:id')
  deletePerson(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.deletePerson(id);
  }

  @Get('afip/:cuit')
  lookupAfip(@Param('cuit') cuit: string) {
    return this.companiesService.lookupAfip(cuit);
  }

  @Get(':id')
  getCompany(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.getCompany(id);
  }

  @Get(':id/people')
  listPeople(@Param('id', ParseUUIDPipe) id: string) {
    return this.companiesService.listPeople(id);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':id')
  updateCompany(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.updateCompany(id, dto);
  }
}
