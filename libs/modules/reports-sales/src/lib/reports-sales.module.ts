import { Module } from '@nestjs/common';
import { ReportsSalesController } from './reports-sales.controller.js';
import { ReportsSalesService } from './reports-sales.service.js';

@Module({
  controllers: [ReportsSalesController],
  providers: [ReportsSalesService],
  exports: [ReportsSalesService],
})
export class ReportsSalesModule {}
