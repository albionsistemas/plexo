import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { UpdateBnaSyncSettingsDto } from './dto/update-bna-sync-settings.dto.js';
import { ExchangeRateSchedulerService } from './exchange-rate-scheduler.service.js';

// "Cotizaciones USD" en el panel Admin - horario/on-off del sweep global
// (no es por tenant, ver ExchangeRateSchedulerService) + "Sincronizar
// ahora" para forzarlo fuera de horario.
@Controller('admin/bna-sync')
@UseGuards(PlatformAdminGuard)
export class AdminBnaSyncController {
  constructor(private readonly exchangeRateScheduler: ExchangeRateSchedulerService) {}

  @Get()
  getSettings() {
    return this.exchangeRateScheduler.getSettings();
  }

  @Patch()
  updateSettings(@Body() dto: UpdateBnaSyncSettingsDto) {
    return this.exchangeRateScheduler.updateSettings(dto);
  }

  @Post('sync-now')
  syncNow() {
    return this.exchangeRateScheduler.syncBnaRateForAllTenants();
  }
}
