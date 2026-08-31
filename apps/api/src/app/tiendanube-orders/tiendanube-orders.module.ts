import { Module } from '@nestjs/common';
import { InventoryModule } from '@plexo/inventory';
import { SalesModule } from '../sales/sales.module.js';
import { TiendanubeOrdersController } from './tiendanube-orders.controller.js';
import { TiendanubeOrdersService } from './tiendanube-orders.service.js';

@Module({
  imports: [SalesModule, InventoryModule],
  controllers: [TiendanubeOrdersController],
  providers: [TiendanubeOrdersService],
})
export class TiendanubeOrdersModule {}
