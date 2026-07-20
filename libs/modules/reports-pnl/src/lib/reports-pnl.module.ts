import { Module } from '@nestjs/common';
import { ReportsPnlController } from './reports-pnl.controller.js';
import { ReportsPnlService } from './reports-pnl.service.js';

@Module({
  controllers: [ReportsPnlController],
  providers: [ReportsPnlService],
  exports: [ReportsPnlService],
})
export class ReportsPnlModule {}
