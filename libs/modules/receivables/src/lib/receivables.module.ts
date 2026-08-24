import { Module } from '@nestjs/common';
import { ReceivablesController } from './receivables.controller.js';
import { ReceivablesService } from './receivables.service.js';
import { CustomerStatementExcelService } from './statement/customer-statement-excel.service.js';
import { CustomerStatementPdfService } from './statement/customer-statement-pdf.service.js';

@Module({
  controllers: [ReceivablesController],
  providers: [ReceivablesService, CustomerStatementPdfService, CustomerStatementExcelService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
