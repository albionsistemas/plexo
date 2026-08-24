import { Module } from '@nestjs/common';
import { PayablesController } from './payables.controller.js';
import { PayablesService } from './payables.service.js';
import { SupplierStatementExcelService } from './statement/supplier-statement-excel.service.js';
import { SupplierStatementPdfService } from './statement/supplier-statement-pdf.service.js';

@Module({
  controllers: [PayablesController],
  providers: [PayablesService, SupplierStatementPdfService, SupplierStatementExcelService],
  exports: [PayablesService],
})
export class PayablesModule {}
