import { Module } from '@nestjs/common';
import { InvoicingModule } from '@plexo/invoicing';
import { ReceivablesModule } from '@plexo/receivables';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';
import { RemindersController } from './reminders.controller.js';

@Module({
  imports: [ReceivablesModule, InvoicingModule, TenantSettingsModule],
  controllers: [RemindersController],
  providers: [ReceivablesSchedulerService],
})
export class SchedulerModule {}
