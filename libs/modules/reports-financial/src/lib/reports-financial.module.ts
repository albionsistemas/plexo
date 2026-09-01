import { Module } from '@nestjs/common';
import { CashflowProjectionExcelService } from './cashflow-projection-excel.service.js';
import { ReportsFinancialController } from './reports-financial.controller.js';
import { ReportsFinancialService } from './reports-financial.service.js';

@Module({
  controllers: [ReportsFinancialController],
  providers: [ReportsFinancialService, CashflowProjectionExcelService],
  exports: [ReportsFinancialService],
})
export class ReportsFinancialModule {}
