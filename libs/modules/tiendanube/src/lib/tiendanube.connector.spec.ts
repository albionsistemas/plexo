import type { ConnectorService } from '@plexo/connectors';
import { TiendanubeConnector } from './tiendanube.connector.js';
import type { TiendanubeOAuthClient } from './tiendanube-oauth.client.js';

function makeConnectorService(overrides: Partial<jest.Mocked<ConnectorService>> = {}) {
  return {
    getOrCreateConnector: jest.fn().mockResolvedValue({ id: 'connector-1' }),
    saveSecret: jest.fn().mockResolvedValue(undefined),
    getSecret: jest.fn(),
    getSecretMeta: jest.fn(),
    finishConnecting: jest.fn().mockResolvedValue({}),
    setStatus: jest.fn().mockResolvedValue({}),
    clearSecrets: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    getConnector: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<ConnectorService>;
}

function makeOAuthClient(overrides: Partial<jest.Mocked<TiendanubeOAuthClient>> = {}) {
  return {
    buildAuthorizationUrl: jest.fn().mockReturnValue('https://www.tiendanube.com/apps/123/authorize?state=...'),
    exchangeCodeForToken: jest.fn(),
    fetchStoreName: jest.fn().mockResolvedValue('Mi Tienda'),
    ...overrides,
  } as unknown as jest.Mocked<TiendanubeOAuthClient>;
}

describe('TiendanubeConnector.getAuthorizationUrl', () => {
  it('passes state straight through to the OAuth client (no PKCE to derive, unlike Mercado Pago)', () => {
    const oauthClient = makeOAuthClient();
    const connector = new TiendanubeConnector(makeConnectorService(), oauthClient);

    const url = connector.getAuthorizationUrl('tenant-1', 'csrf-state-token');

    expect(url).toBe('https://www.tiendanube.com/apps/123/authorize?state=...');
    expect(oauthClient.buildAuthorizationUrl).toHaveBeenCalledWith('csrf-state-token');
  });
});

describe('TiendanubeConnector.handleOAuthCallback', () => {
  it('exchanges the code for a token, saves it encrypted via ConnectorService (no expiresAt), and marks the connector CONNECTED', async () => {
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForToken: jest.fn().mockResolvedValue({
        access_token: 'tn-access-token',
        token_type: 'bearer',
        scope: 'read_products write_orders',
        user_id: 654321,
      }),
    } as never);
    const connector = new TiendanubeConnector(connectorService, oauthClient);

    await connector.handleOAuthCallback('tenant-1', 'auth-code-from-tn');

    expect(connectorService.getOrCreateConnector).toHaveBeenCalledWith('TIENDANUBE');
    expect(oauthClient.exchangeCodeForToken).toHaveBeenCalledWith('auth-code-from-tn');
    // No expiresAt argument - Tiendanube's access token never expires.
    expect(connectorService.saveSecret).toHaveBeenCalledWith('connector-1', 'access_token', 'tn-access-token');
    expect(connectorService.finishConnecting).toHaveBeenCalledWith('connector-1', {
      externalAccountId: '654321',
      externalNickname: 'Mi Tienda',
      scopes: 'read_products write_orders',
    });
  });

  it('marks the connector ERROR and rethrows when the token exchange itself fails', async () => {
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForToken: jest.fn().mockRejectedValue(new Error('invalid_grant')),
    } as never);
    const connector = new TiendanubeConnector(connectorService, oauthClient);

    await expect(connector.handleOAuthCallback('tenant-1', 'auth-code-from-tn')).rejects.toThrow('invalid_grant');

    expect(connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'ERROR',
      'No se pudo completar la vinculación con Tiendanube',
    );
    expect(connectorService.saveSecret).not.toHaveBeenCalled();
  });

  it('marks the connector ERROR when Tiendanube returns an incomplete token response', async () => {
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForToken: jest.fn().mockResolvedValue({ access_token: 'tn-x' }),
    } as never);
    const connector = new TiendanubeConnector(connectorService, oauthClient);

    await expect(connector.handleOAuthCallback('tenant-1', 'auth-code-from-tn')).rejects.toThrow();

    expect(connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'ERROR',
      expect.stringContaining('incompleta'),
    );
  });

  it('still connects successfully even when fetching the store name fails (best-effort)', async () => {
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForToken: jest.fn().mockResolvedValue({
        access_token: 'tn-access-token',
        user_id: 654321,
      }),
      fetchStoreName: jest.fn().mockRejectedValue(new Error('network blip')),
    } as never);
    const connector = new TiendanubeConnector(connectorService, oauthClient);

    await connector.handleOAuthCallback('tenant-1', 'auth-code-from-tn');

    expect(connectorService.finishConnecting).toHaveBeenCalledWith(
      'connector-1',
      expect.objectContaining({ externalNickname: undefined }),
    );
  });
});

describe('TiendanubeConnector.refreshIfNeeded', () => {
  it('is a no-op - Tiendanube access tokens never expire, there is nothing to refresh', async () => {
    const connectorService = makeConnectorService();
    const connector = new TiendanubeConnector(connectorService, makeOAuthClient());

    await connector.refreshIfNeeded('connector-1');

    expect(connectorService.setStatus).not.toHaveBeenCalled();
    expect(connectorService.getSecret).not.toHaveBeenCalled();
  });
});

describe('TiendanubeConnector.getValidAccessToken', () => {
  it('returns the stored access_token as-is', async () => {
    const connectorService = makeConnectorService({
      getSecret: jest.fn().mockResolvedValue('tn-access-token'),
    } as never);
    const connector = new TiendanubeConnector(connectorService, makeOAuthClient());

    const token = await connector.getValidAccessToken('connector-1');

    expect(token).toBe('tn-access-token');
  });

  it('throws when no access_token was ever stored for this connector', async () => {
    const connectorService = makeConnectorService({
      getSecret: jest.fn().mockResolvedValue(null),
    } as never);
    const connector = new TiendanubeConnector(connectorService, makeOAuthClient());

    await expect(connector.getValidAccessToken('connector-1')).rejects.toThrow();
  });
});

describe('TiendanubeConnector.disconnect', () => {
  it('delegates to ConnectorService.disconnect for the TIENDANUBE provider', async () => {
    const connectorService = makeConnectorService();
    const connector = new TiendanubeConnector(connectorService, makeOAuthClient());

    await connector.disconnect('tenant-1');

    expect(connectorService.disconnect).toHaveBeenCalledWith('TIENDANUBE');
  });
});
