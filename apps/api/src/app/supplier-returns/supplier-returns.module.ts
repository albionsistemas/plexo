import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { InventoryModule } from '@plexo/inventory';
import { PurchasesModule } from '@plexo/purchases';
import { SupplierReturnsController } from './supplier-returns.controller.js';
import { SupplierReturnsService } from './supplier-returns.service.js';

@Module({
  imports: [PurchasesModule, InventoryModule, AccountingModule],
  controllers: [SupplierReturnsController],
  providers: [SupplierReturnsService],
})
export class SupplierReturnsModule {}
