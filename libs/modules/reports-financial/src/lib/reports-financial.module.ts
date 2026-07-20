import { Module } from '@nestjs/common';
import { ReportsFinancialController } from './reports-financial.controller.js';
import { ReportsFinancialService } from './reports-financial.service.js';

@Module({
  controllers: [ReportsFinancialController],
  providers: [ReportsFinancialService],
  exports: [ReportsFinancialService],
})
export class ReportsFinancialModule {}
