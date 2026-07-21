import { Module } from '@nestjs/common';
import { InvoicingModule } from '@plexo/invoicing';
import { ReceivablesModule } from '@plexo/receivables';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';

@Module({
  imports: [ReceivablesModule, InvoicingModule],
  providers: [ReceivablesSchedulerService],
})
export class SchedulerModule {}
