import { Module, type OnModuleInit } from '@nestjs/common';
import { ConnectorRegistry, ConnectorsModule } from '@plexo/connectors';
import { TiendanubeApiClient } from './tiendanube-api.client.js';
import { TiendanubeConfigService } from './tiendanube-config.service.js';
import { TiendanubeConnector } from './tiendanube.connector.js';
import { TiendanubeController } from './tiendanube.controller.js';
import { TiendanubeOAuthClient } from './tiendanube-oauth.client.js';
import { TiendanubeStateService } from './tiendanube-state.service.js';

// Not @Global() - same reasoning as MercadoPagoModule/ConnectorsModule:
// only apps/api's composition root needs this. TiendanubeApiClient is
// exported (not just TiendanubeConnector) because Fases 2-4 (orders/stock/
// catalog sync) will need it directly from their own composition-root
// services in apps/api, the same way MercadoPagoPaymentClient is exported
// today for the webhook module.
@Module({
  imports: [ConnectorsModule],
  controllers: [TiendanubeController],
  providers: [
    TiendanubeConfigService,
    TiendanubeOAuthClient,
    TiendanubeApiClient,
    TiendanubeStateService,
    TiendanubeConnector,
  ],
  exports: [TiendanubeConfigService, TiendanubeApiClient, TiendanubeConnector],
})
export class TiendanubeModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly connector: TiendanubeConnector,
  ) {}

  // Registration happens here, not in ConnectorsModule, same pattern as
  // MercadoPagoModule - adding Mercado Libre later is "new module + this
  // same one-line onModuleInit", never a change to @plexo/connectors.
  onModuleInit(): void {
    this.registry.register(this.connector);
  }
}
