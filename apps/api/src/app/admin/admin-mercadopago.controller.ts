import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PlatformAdminGuard } from '@plexo/auth';
import { AdminMercadoPagoService } from './admin-mercadopago.service.js';

@Controller('admin/mercadopago')
@UseGuards(PlatformAdminGuard)
export class AdminMercadoPagoController {
  constructor(private readonly adminMercadoPagoService: AdminMercadoPagoService) {}

  @Get('metrics')
  getMetrics() {
    return this.adminMercadoPagoService.getMetrics();
  }

  @Get('webhook-events')
  listFailedWebhookEvents(@Query('limit') limit?: string) {
    return this.adminMercadoPagoService.listFailedWebhookEvents(Number(limit) || 100);
  }
}
