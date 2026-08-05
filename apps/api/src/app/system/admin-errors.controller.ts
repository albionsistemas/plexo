import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { SystemErrorLogService } from './system-error-log.service.js';

@Controller('admin/errors')
@UseGuards(PlatformAdminGuard)
export class AdminErrorsController {
  constructor(private readonly systemErrorLogService: SystemErrorLogService) {}

  @Get()
  list(
    @Query('limit') limit?: string,
    @Query('tenantId') tenantId?: string,
    @Query('statusCodeMin') statusCodeMin?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.systemErrorLogService.list({
      limit: Math.min(Number(limit) || 100, 500),
      tenantId,
      statusCodeMin: statusCodeMin ? Number(statusCodeMin) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
