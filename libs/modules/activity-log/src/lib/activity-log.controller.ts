import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { ActivityLogService } from './activity-log.service.js';

// Full detail (IP, diff) is tenant-admin-only - matches the roles already
// gating tenant-wide config in TenantSettingsController.
const READ_ROLES = ['OWNER', 'ADMIN'] as const;

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly activityLogService: ActivityLogService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.activityLogService.listForTenant({
      page: Number(page) || 1,
      pageSize: Math.min(Number(pageSize) || 50, 200),
      userId,
      entityType,
    });
  }
}
