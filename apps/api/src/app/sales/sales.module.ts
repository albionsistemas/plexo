import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { InventoryModule } from '@plexo/inventory';
import { InvoicingModule } from '@plexo/invoicing';
import { TenantSettingsModule } from '@plexo/tenant-settings';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [InventoryModule, InvoicingModule, AccountingModule, TenantSettingsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
