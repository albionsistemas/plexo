import { Module } from '@nestjs/common';
import { TenantSettingsController } from './tenant-settings.controller.js';
import { TenantSettingsService } from './tenant-settings.service.js';

@Module({
  controllers: [TenantSettingsController],
  providers: [TenantSettingsService],
  exports: [TenantSettingsService],
})
export class TenantSettingsModule {}
