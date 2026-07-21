import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardGateway } from './dashboard.gateway.js';
import { DashboardService } from './dashboard.service.js';

@Module({
  controllers: [DashboardController],
  providers: [DashboardGateway, DashboardService],
})
export class DashboardModule {}
