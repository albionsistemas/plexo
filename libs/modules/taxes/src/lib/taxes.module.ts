import { Module } from '@nestjs/common';
import { TaxesController } from './taxes.controller.js';
import { TaxesService } from './taxes.service.js';
import { CitiExportService } from './vat-book/citi/citi-export.service.js';
import { VatBookExcelService } from './vat-book/vat-book-excel.service.js';
import { VatBookPdfService } from './vat-book/pdf/vat-book-pdf.service.js';
import { VatBookService } from './vat-book/vat-book.service.js';
import { WithholdingRegimeService } from './withholding-regime.service.js';

@Module({
  controllers: [TaxesController],
  providers: [
    TaxesService,
    WithholdingRegimeService,
    VatBookService,
    VatBookExcelService,
    VatBookPdfService,
    CitiExportService,
  ],
  exports: [TaxesService, WithholdingRegimeService, VatBookService],
})
export class TaxesModule {}
