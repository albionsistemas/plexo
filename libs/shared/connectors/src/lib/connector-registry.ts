import { Injectable, NotFoundException } from '@nestjs/common';
import type { ConnectorProvider } from '@plexo/database';
import type { ProviderConnector } from './provider-connector.interface.js';

/**
 * Indexes every registered ProviderConnector by provider, so adding
 * Tiendanube/Mercado Libre later is "implement ProviderConnector + call
 * register() from that provider's own module" - nothing here changes.
 * Registration happens at module init time (each provider module injects
 * this and registers itself), not via a static list, so this stays a plain
 * util rather than something DI has to construct with prior knowledge of
 * every provider.
 */
@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorProvider, ProviderConnector>();

  register(connector: ProviderConnector): void {
    this.connectors.set(connector.provider, connector);
  }

  get(provider: ConnectorProvider): ProviderConnector {
    const connector = this.connectors.get(provider);
    if (!connector) {
      throw new NotFoundException(`No hay un connector registrado para ${provider}`);
    }
    return connector;
  }
}
