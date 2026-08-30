import { Module } from '@nestjs/common';
import { ConnectorRegistry } from './connector-registry.js';
import { ConnectorService } from './connector.service.js';

// Not @Global() - same reasoning as AfipCredentialsModule: only whichever
// modules actually implement a ProviderConnector (mercadopago today) need
// this, unlike DatabaseModule/EncryptionModule which everything touches.
@Module({
  providers: [ConnectorService, ConnectorRegistry],
  exports: [ConnectorService, ConnectorRegistry],
})
export class ConnectorsModule {}
