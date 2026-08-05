import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { BackupSchedulerService } from './backup-scheduler.service.js';

// Sólo lectura a propósito - no hay endpoint de "Restaurar backup" (ver
// PROGRESS.md): un restore pisa TODOS los tenants de la plataforma a la
// vez, no algo para un botón de un click en esta primera versión.
@Controller('admin/backups')
@UseGuards(PlatformAdminGuard)
export class AdminBackupsController {
  constructor(private readonly backupSchedulerService: BackupSchedulerService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.backupSchedulerService.list(Math.min(Number(limit) || 30, 100));
  }
}
