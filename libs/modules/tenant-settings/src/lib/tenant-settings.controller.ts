import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import { RegisterDomainDto } from './dto/register-domain.dto.js';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto.js';
import { TenantSettingsService } from './tenant-settings.service.js';

// Tenant-wide business policy, not a personal preference like theme/density
// - restricted the same way other tenant-level config would be, matching
// the roles that can already create/edit Company records.
const WRITE_ROLES = ['OWNER', 'ADMIN'] as const;

@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}

  @Get()
  getSettings() {
    return this.tenantSettingsService.getSettings();
  }

  @AuditEntity('tenantSettings', { idParam: null })
  @Roles(...WRITE_ROLES)
  @Patch()
  updateSettings(@Body() dto: UpdateTenantSettingsDto) {
    return this.tenantSettingsService.updateSettings(dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('email-domain')
  registerDomain(@Body() dto: RegisterDomainDto) {
    return this.tenantSettingsService.registerCustomDomain(dto.domain);
  }

  @Roles(...WRITE_ROLES)
  @Post('email-domain/verify')
  verifyDomain() {
    return this.tenantSettingsService.refreshDomainStatus();
  }
}
