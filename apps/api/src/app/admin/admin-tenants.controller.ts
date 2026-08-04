import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { AdminTenantsService } from './admin-tenants.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Controller('admin/tenants')
@UseGuards(PlatformAdminGuard)
export class AdminTenantsController {
  constructor(private readonly adminTenantsService: AdminTenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.adminTenantsService.createTenant(dto);
  }
}
