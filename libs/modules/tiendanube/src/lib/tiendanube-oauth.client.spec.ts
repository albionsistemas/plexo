import { ServiceUnavailableException } from '@nestjs/common';
import { TiendanubeConfigService } from './tiendanube-config.service.js';
import { TiendanubeOAuthClient } from './tiendanube-oauth.client.js';
import { TiendanubeApiError } from './tiendanube-errors.js';

const originalFetch = global.fetch;
const ENV_KEYS = [
  'TIENDANUBE_APP_ID',
  'TIENDANUBE_CLIENT_SECRET',
  'TIENDANUBE_OAUTH_REDIRECT_URI',
  'TIENDANUBE_APP_USER_AGENT',
];

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('TiendanubeOAuthClient', () => {
  let fetchMock: jest.Mock;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env['TIENDANUBE_APP_ID'] = '123';
    process.env['TIENDANUBE_CLIENT_SECRET'] = 'secret-xyz';
    process.env['TIENDANUBE_OAUTH_REDIRECT_URI'] = 'https://app.oplex.com.ar/api/connectors/tiendanube/callback';
    process.env['TIENDANUBE_APP_USER_AGENT'] = 'OPLEX (soporte@oplex.com.ar)';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    global.fetch = originalFetch;
  });

  describe('buildAuthorizationUrl', () => {
    it('builds the authorize URL with app_id and state, without hitting the network', () => {
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      const url = client.buildAuthorizationUrl('csrf-token-abc');

      expect(url).toBe('https://www.tiendanube.com/apps/123/authorize?state=csrf-token-abc');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException when required env vars are missing', () => {
      delete process.env['TIENDANUBE_CLIENT_SECRET'];
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      expect(() => client.buildAuthorizationUrl('state')).toThrow(ServiceUnavailableException);
    });
  });

  describe('exchangeCodeForToken', () => {
    it('POSTs client_id/client_secret/grant_type/code in the JSON body - no redirect_uri, no state', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ access_token: 'tn-token', token_type: 'bearer', scope: 'read', user_id: 999 }),
      );
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      const result = await client.exchangeCodeForToken('the-auth-code');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.tiendanube.com/apps/authorize/token',
        expect.objectContaining({ method: 'POST' }),
      );
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        client_id: '123',
        client_secret: 'secret-xyz',
        grant_type: 'authorization_code',
        code: 'the-auth-code',
      });
      expect(init.headers['User-Agent']).toBe('OPLEX (soporte@oplex.com.ar)');
      expect(result).toEqual({ access_token: 'tn-token', token_type: 'bearer', scope: 'read', user_id: 999 });
    });

    it('throws TiendanubeApiError when Tiendanube rejects the exchange', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, { status: 400 }));
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      await expect(client.exchangeCodeForToken('bad-code')).rejects.toBeInstanceOf(TiendanubeApiError);
    });
  });

  describe('fetchStoreName', () => {
    it('picks the name in the store main_language when present', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ id: 999, main_language: 'es', name: { en: 'Poke Store', es: 'Poke Tienda' } }),
      );
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      const name = await client.fetchStoreName('tn-token', '999');

      expect(name).toBe('Poke Tienda');
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.tiendanube.com/2025-03/999/store');
      expect(init.headers['Authorization']).toBe('Bearer tn-token');
    });

    it('falls back to any available language when main_language is absent', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ id: 999, name: { pt: 'Poke Loja' } }));
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      const name = await client.fetchStoreName('tn-token', '999');

      expect(name).toBe('Poke Loja');
    });

    it('returns undefined (never throws) when the store lookup fails - best-effort only', async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, { status: 500 }));
      const client = new TiendanubeOAuthClient(new TiendanubeConfigService());

      const name = await client.fetchStoreName('tn-token', '999');

      expect(name).toBeUndefined();
    });
  });
});
