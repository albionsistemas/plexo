import { Module } from '@nestjs/common';
import { InventoryModule } from '@plexo/inventory';
import { DashboardController } from './dashboard.controller.js';
import { DashboardGateway } from './dashboard.gateway.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [DashboardController],
  providers: [DashboardGateway, DashboardService],
})
export class DashboardModule {}
