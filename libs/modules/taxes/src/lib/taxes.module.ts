import { Module } from '@nestjs/common';
import { TaxesController } from './taxes.controller.js';
import { TaxesService } from './taxes.service.js';

@Module({
  controllers: [TaxesController],
  providers: [TaxesService],
  exports: [TaxesService],
})
export class TaxesModule {}
