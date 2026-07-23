import { Controller, Get, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { TenantSettingsService } from '@plexo/tenant-settings';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';

// Same restriction as PATCH /tenant-settings - triggering/resetting the
// reminder sweep on demand is an admin action, not something every SALES
// user should be able to fire.
const WRITE_ROLES = ['OWNER', 'ADMIN'] as const;

/** Local-clock estimate of the next EVERY_DAY_AT_1AM firing - @nestjs/schedule
 * doesn't expose a "when does this cron next run" query, and it isn't worth
 * pulling in its SchedulerRegistry just to read that back; the schedule
 * itself is a fixed, known constant (see ReceivablesSchedulerService). */
function nextDailyRunAt(hour = 1): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

@Controller('receivables/reminders')
export class RemindersController {
  constructor(
    private readonly schedulerService: ReceivablesSchedulerService,
    private readonly tenantSettingsService: TenantSettingsService,
  ) {}

  @Get('status')
  async getStatus() {
    const settings = await this.tenantSettingsService.getSettings();
    return {
      recurringEnabled: settings.arReminderIntervalDays !== null,
      arReminderIntervalDays: settings.arReminderIntervalDays,
      // The daily cron runs for every tenant regardless of this setting -
      // what the setting controls is only whether that run ALSO re-sends
      // reminders for invoices that were already overdue (see
      // ReceivablesSchedulerService.runReminderSweepForCurrentTenant).
      nextCronRunAt: nextDailyRunAt().toISOString(),
    };
  }

  @Roles(...WRITE_ROLES)
  @Post('run-now')
  runNow() {
    return this.schedulerService.runReminderSweepForCurrentTenant();
  }

  @Roles(...WRITE_ROLES)
  @Post('reset')
  reset() {
    return this.schedulerService.resetReminderClockForCurrentTenant();
  }
}
