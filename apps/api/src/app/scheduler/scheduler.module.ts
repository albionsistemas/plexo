import { Module } from '@nestjs/common';
import { InvoicingModule } from '@plexo/invoicing';
import { ReceivablesModule } from '@plexo/receivables';
import { SubscriptionModule } from '@plexo/subscriptions';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { AdminBackupsController } from './admin-backups.controller.js';
import { BackupSchedulerService } from './backup-scheduler.service.js';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';
import { RemindersController } from './reminders.controller.js';
import { SubscriptionsSchedulerService } from './subscriptions-scheduler.service.js';

@Module({
  imports: [ReceivablesModule, InvoicingModule, TenantSettingsModule, SubscriptionModule],
  controllers: [RemindersController, AdminBackupsController],
  providers: [ReceivablesSchedulerService, SubscriptionsSchedulerService, BackupSchedulerService],
})
export class SchedulerModule {}
