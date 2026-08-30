import type { ProviderConnector } from './provider-connector.interface.js';
import { ConnectorRegistry } from './connector-registry.js';

function fakeConnector(provider: ProviderConnector['provider']): ProviderConnector {
  return {
    provider,
    getAuthorizationUrl: jest.fn(),
    handleOAuthCallback: jest.fn(),
    refreshIfNeeded: jest.fn(),
    disconnect: jest.fn(),
  };
}

describe('ConnectorRegistry', () => {
  it('returns the connector registered for a provider', () => {
    const registry = new ConnectorRegistry();
    const mercadoPago = fakeConnector('MERCADO_PAGO');

    registry.register(mercadoPago);

    expect(registry.get('MERCADO_PAGO')).toBe(mercadoPago);
  });

  it('throws when nothing is registered for that provider', () => {
    const registry = new ConnectorRegistry();

    expect(() => registry.get('TIENDANUBE')).toThrow('No hay un connector registrado para TIENDANUBE');
  });

  it('a later register() for the same provider replaces the earlier one', () => {
    const registry = new ConnectorRegistry();
    const first = fakeConnector('MERCADO_PAGO');
    const second = fakeConnector('MERCADO_PAGO');

    registry.register(first);
    registry.register(second);

    expect(registry.get('MERCADO_PAGO')).toBe(second);
  });
});
