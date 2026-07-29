import { Module } from '@nestjs/common';
import { InventoryModule } from '@plexo/inventory';
import { PurchasesModule } from '@plexo/purchases';
import { GoodsReceiptsController } from './goods-receipts.controller.js';
import { GoodsReceiptsService } from './goods-receipts.service.js';

@Module({
  imports: [PurchasesModule, InventoryModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
