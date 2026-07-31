import { Module } from '@nestjs/common';
import { TaxesController } from './taxes.controller.js';
import { TaxesService } from './taxes.service.js';
import { WithholdingRegimeService } from './withholding-regime.service.js';

@Module({
  controllers: [TaxesController],
  providers: [TaxesService, WithholdingRegimeService],
  exports: [TaxesService, WithholdingRegimeService],
})
export class TaxesModule {}
