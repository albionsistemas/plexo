import { Module } from '@nestjs/common';
import { CompaniesModule } from '@plexo/companies';
import { ConnectorsModule } from '@plexo/connectors';
import { TiendanubeModule } from '@plexo/tiendanube';
import { TiendanubeWebhookController } from './tiendanube-webhook.controller.js';
import { TiendanubeWebhookService } from './tiendanube-webhook.service.js';

@Module({
  imports: [TiendanubeModule, ConnectorsModule, CompaniesModule],
  controllers: [TiendanubeWebhookController],
  providers: [TiendanubeWebhookService],
})
export class TiendanubeWebhookModule {}
