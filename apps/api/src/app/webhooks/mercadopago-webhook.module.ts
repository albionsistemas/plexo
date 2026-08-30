import { Module } from '@nestjs/common';
import { ConnectorsModule } from '@plexo/connectors';
import { MercadoPagoModule } from '@plexo/mercadopago';
import { SalesModule } from '../sales/sales.module.js';
import { MercadoPagoWebhookController } from './mercadopago-webhook.controller.js';
import { MercadoPagoWebhookService } from './mercadopago-webhook.service.js';

@Module({
  imports: [MercadoPagoModule, ConnectorsModule, SalesModule],
  controllers: [MercadoPagoWebhookController],
  providers: [MercadoPagoWebhookService],
})
export class MercadoPagoWebhookModule {}
