import { Module } from '@nestjs/common';
import { InventoryModule } from '@plexo/inventory';
import { InvoicingModule } from '@plexo/invoicing';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [InventoryModule, InvoicingModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
