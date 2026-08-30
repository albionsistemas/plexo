import { JwtService } from '@nestjs/jwt';
import { MPAuthenticationError, MPForbiddenError } from 'mercadopago';
import type { ConnectorService } from '@plexo/connectors';
import { MercadoPagoConnector } from './mercadopago.connector.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';
import type { MercadoPagoOAuthClient } from './mercadopago-oauth.client.js';
import { codeChallengeFromVerifier } from './pkce.js';

function makeStateService(): MercadoPagoStateService {
  return new MercadoPagoStateService(new JwtService({ secret: 'test-secret' }));
}

function signValidState(stateService: MercadoPagoStateService) {
  return stateService.sign({ tenantId: 'tenant-1', userId: 'user-1', codeVerifier: 'verifier-xyz' });
}

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

function makeOAuthClient(overrides: Partial<jest.Mocked<MercadoPagoOAuthClient>> = {}) {
  return {
    buildAuthorizationUrl: jest.fn().mockReturnValue('https://auth.mercadopago.com/authorization?...'),
    exchangeCodeForTokens: jest.fn(),
    refreshTokens: jest.fn(),
    fetchAccountNickname: jest.fn().mockResolvedValue('MI NEGOCIO'),
    ...overrides,
  } as unknown as jest.Mocked<MercadoPagoOAuthClient>;
}

describe('MercadoPagoConnector.getAuthorizationUrl', () => {
  it('derives the PKCE code_challenge from the codeVerifier embedded in state and asks the client to build the URL', () => {
    const stateService = makeStateService();
    const state = signValidState(stateService);
    const oauthClient = makeOAuthClient();
    const connector = new MercadoPagoConnector(makeConnectorService(), oauthClient, stateService);

    const url = connector.getAuthorizationUrl('tenant-1', state);

    expect(url).toBe('https://auth.mercadopago.com/authorization?...');
    expect(oauthClient.buildAuthorizationUrl).toHaveBeenCalledWith({
      state,
      codeChallenge: codeChallengeFromVerifier('verifier-xyz'),
    });
  });

  it('throws instead of building a URL for an invalid state', () => {
    const stateService = makeStateService();
    const connector = new MercadoPagoConnector(makeConnectorService(), makeOAuthClient(), stateService);

    expect(() => connector.getAuthorizationUrl('tenant-1', 'not-a-real-token')).toThrow();
  });
});

describe('MercadoPagoConnector.handleOAuthCallback', () => {
  it('exchanges the code for tokens, saves them encrypted via ConnectorService, and marks the connector CONNECTED', async () => {
    const stateService = makeStateService();
    const state = signValidState(stateService);
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForTokens: jest.fn().mockResolvedValue({
        access_token: 'APP_USR-access-token',
        refresh_token: 'TG-refresh-token',
        user_id: 123456,
        scope: 'read write offline_access',
        expires_in: 15552000,
      }),
    } as never);
    const connector = new MercadoPagoConnector(connectorService, oauthClient, stateService);

    await connector.handleOAuthCallback('tenant-1', 'auth-code-from-mp', state);

    expect(connectorService.getOrCreateConnector).toHaveBeenCalledWith('MERCADO_PAGO');
    expect(oauthClient.exchangeCodeForTokens).toHaveBeenCalledWith({
      code: 'auth-code-from-mp',
      codeVerifier: 'verifier-xyz',
    });
    expect(connectorService.saveSecret).toHaveBeenCalledWith(
      'connector-1',
      'access_token',
      'APP_USR-access-token',
      expect.any(Date),
    );
    expect(connectorService.saveSecret).toHaveBeenCalledWith('connector-1', 'refresh_token', 'TG-refresh-token');
    expect(connectorService.finishConnecting).toHaveBeenCalledWith('connector-1', {
      externalAccountId: '123456',
      externalNickname: 'MI NEGOCIO',
      scopes: 'read write offline_access',
    });
  });

  it('rejects an invalid state before ever touching the connector or calling Mercado Pago', async () => {
    const stateService = makeStateService();
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient();
    const connector = new MercadoPagoConnector(connectorService, oauthClient, stateService);

    await expect(
      connector.handleOAuthCallback('tenant-1', 'auth-code-from-mp', 'not-a-real-token'),
    ).rejects.toThrow();

    expect(connectorService.getOrCreateConnector).not.toHaveBeenCalled();
    expect(oauthClient.exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it('marks the connector ERROR and rethrows when the token exchange itself fails', async () => {
    const stateService = makeStateService();
    const state = signValidState(stateService);
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForTokens: jest.fn().mockRejectedValue(new Error('invalid_grant')),
    } as never);
    const connector = new MercadoPagoConnector(connectorService, oauthClient, stateService);

    await expect(connector.handleOAuthCallback('tenant-1', 'auth-code-from-mp', state)).rejects.toThrow(
      'invalid_grant',
    );

    expect(connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'ERROR',
      'No se pudo completar la vinculación con Mercado Pago',
    );
    expect(connectorService.saveSecret).not.toHaveBeenCalled();
  });

  it('marks the connector ERROR when Mercado Pago returns an incomplete token response', async () => {
    const stateService = makeStateService();
    const state = signValidState(stateService);
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      // access_token present, refresh_token missing - offline_access wasn't
      // actually granted, or MP changed its response shape.
      exchangeCodeForTokens: jest.fn().mockResolvedValue({ access_token: 'APP_USR-x' }),
    } as never);
    const connector = new MercadoPagoConnector(connectorService, oauthClient, stateService);

    await expect(connector.handleOAuthCallback('tenant-1', 'auth-code-from-mp', state)).rejects.toThrow();

    expect(connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'ERROR',
      expect.stringContaining('incompleta'),
    );
  });

  it('still connects successfully even when fetching the account nickname fails (best-effort)', async () => {
    const stateService = makeStateService();
    const state = signValidState(stateService);
    const connectorService = makeConnectorService();
    const oauthClient = makeOAuthClient({
      exchangeCodeForTokens: jest.fn().mockResolvedValue({
        access_token: 'APP_USR-access-token',
        refresh_token: 'TG-refresh-token',
        user_id: 123456,
      }),
      fetchAccountNickname: jest.fn().mockRejectedValue(new Error('network blip')),
    } as never);
    const connector = new MercadoPagoConnector(connectorService, oauthClient, stateService);

    await connector.handleOAuthCallback('tenant-1', 'auth-code-from-mp', state);

    expect(connectorService.finishConnecting).toHaveBeenCalledWith(
      'connector-1',
      expect.objectContaining({ externalNickname: undefined }),
    );
  });
});

describe('MercadoPagoConnector.refreshIfNeeded', () => {
  it('does nothing when the stored access_token is not close to expiring', async () => {
    const connectorService = makeConnectorService({
      getSecretMeta: jest.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000) }),
    } as never);
    const oauthClient = makeOAuthClient();
    const connector = new MercadoPagoConnector(connectorService, oauthClient, makeStateService());

    await connector.refreshIfNeeded('connector-1');

    expect(oauthClient.refreshTokens).not.toHaveBeenCalled();
  });

  it('refreshes and rotates both tokens when the access_token is close to expiring', async () => {
    const connectorService = makeConnectorService({
      getSecretMeta: jest.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 60 * 60 * 1000) }),
      getSecret: jest.fn().mockResolvedValue('old-refresh-token'),
    } as never);
    const oauthClient = makeOAuthClient({
      refreshTokens: jest.fn().mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 15552000,
      }),
    } as never);
    const connector = new MercadoPagoConnector(connectorService, oauthClient, makeStateService());

    await connector.refreshIfNeeded('connector-1');

    expect(oauthClient.refreshTokens).toHaveBeenCalledWith('old-refresh-token');
    expect(connectorService.saveSecret).toHaveBeenCalledWith(
      'connector-1',
      'access_token',
      'new-access-token',
      expect.any(Date),
    );
    // MP rotates refresh_token on every use - the NEW one must be stored,
    // never the one that was just spent.
    expect(connectorService.saveSecret).toHaveBeenCalledWith('connector-1', 'refresh_token', 'new-refresh-token');
    expect(connectorService.setStatus).toHaveBeenCalledWith('connector-1', 'CONNECTED');
  });

  it('marks EXPIRED without calling Mercado Pago when there is no refresh_token stored', async () => {
    const connectorService = makeConnectorService({
      getSecretMeta: jest.fn().mockResolvedValue(null),
      getSecret: jest.fn().mockResolvedValue(null),
    } as never);
    const oauthClient = makeOAuthClient();
    const connector = new MercadoPagoConnector(connectorService, oauthClient, makeStateService());

    await connector.refreshIfNeeded('connector-1');

    expect(oauthClient.refreshTokens).not.toHaveBeenCalled();
    expect(connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'EXPIRED',
      'No hay refresh_token guardado',
    );
  });

  it('marks EXPIRED (not REVOKED) and rethrows for a non-auth failure (e.g. MP still down after retries)', async () => {
    const connectorService = makeConnectorService({
      getSecretMeta: jest.fn().mockResolvedValue(null),
      getSecret: jest.fn().mockResolvedValue('old-refresh-token'),
    } as never);
    const oauthClient = makeOAuthClient({
      refreshTokens: jest.fn().mockRejectedValue(new Error('network still unreachable')),
    } as never);
    const connector = new MercadoPagoConnector(connectorService, oauthClient, makeStateService());

    await expect(connector.refreshIfNeeded('connector-1')).rejects.toThrow('network still unreachable');

    expect(connectorService.setStatus).toHaveBeenCalledWith(
      'connector-1',
      'EXPIRED',
      'No se pudo refrescar el token de Mercado Pago - hace falta reconectar',
    );
    expect(connectorService.clearSecrets).not.toHaveBeenCalled();
  });

  it('marks REVOKED and clears secrets when the FINAL error (after oauthClient\'s own retries) is a 401/403', async () => {
    for (const authError of [new MPAuthenticationError({ status: 401 }), new MPForbiddenError({ status: 403 })]) {
      const connectorService = makeConnectorService({
        getSecretMeta: jest.fn().mockResolvedValue(null),
        getSecret: jest.fn().mockResolvedValue('old-refresh-token'),
      } as never);
      const oauthClient = makeOAuthClient({
        refreshTokens: jest.fn().mockRejectedValue(authError),
      } as never);
      const connector = new MercadoPagoConnector(connectorService, oauthClient, makeStateService());

      await expect(connector.refreshIfNeeded('connector-1')).rejects.toBe(authError);

      expect(connectorService.clearSecrets).toHaveBeenCalledWith('connector-1');
      expect(connectorService.setStatus).toHaveBeenCalledWith(
        'connector-1',
        'REVOKED',
        expect.stringContaining('desautorizó'),
      );
    }
  });
});

describe('MercadoPagoConnector.disconnect', () => {
  it('delegates to ConnectorService.disconnect for the MERCADO_PAGO provider', async () => {
    const connectorService = makeConnectorService();
    const connector = new MercadoPagoConnector(connectorService, makeOAuthClient(), makeStateService());

    await connector.disconnect('tenant-1');

    expect(connectorService.disconnect).toHaveBeenCalledWith('MERCADO_PAGO');
  });
});
