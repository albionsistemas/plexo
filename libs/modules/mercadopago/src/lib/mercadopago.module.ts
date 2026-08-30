import { Module, type OnModuleInit } from '@nestjs/common';
import { ConnectorRegistry, ConnectorsModule } from '@plexo/connectors';
import { MercadoPagoConfigService } from './mercadopago-config.service.js';
import { MercadoPagoConnector } from './mercadopago.connector.js';
import { MercadoPagoController } from './mercadopago.controller.js';
import { MercadoPagoOAuthClient } from './mercadopago-oauth.client.js';
import { MercadoPagoPaymentLinksController } from './mercadopago-payment-links.controller.js';
import { MercadoPagoPaymentService } from './mercadopago-payment.service.js';
import { MercadoPagoPreferenceClient } from './mercadopago-preference.client.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';

// Not @Global() - same reasoning as ConnectorsModule/AfipCredentialsModule:
// only apps/api's composition root needs this (registers the controllers +
// the OnModuleInit registration below), no other module depends on it.
@Module({
  imports: [ConnectorsModule],
  controllers: [MercadoPagoController, MercadoPagoPaymentLinksController],
  providers: [
    MercadoPagoConfigService,
    MercadoPagoOAuthClient,
    MercadoPagoPreferenceClient,
    MercadoPagoStateService,
    MercadoPagoConnector,
    MercadoPagoPaymentService,
  ],
  exports: [MercadoPagoConnector, MercadoPagoPaymentService],
})
export class MercadoPagoModule implements OnModuleInit {
  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly connector: MercadoPagoConnector,
  ) {}

  // Registration happens here, not in ConnectorsModule, so adding
  // Tiendanube/Mercado Libre later is "new module + this same one-line
  // onModuleInit", never a change to @plexo/connectors itself.
  onModuleInit(): void {
    this.registry.register(this.connector);
  }
}
