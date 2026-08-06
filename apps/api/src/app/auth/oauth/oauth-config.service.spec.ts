import { OAuthConfigService } from './oauth-config.service.js';

describe('OAuthConfigService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports a provider as configured only when both client id and secret are set', () => {
    delete process.env['GOOGLE_CLIENT_ID'];
    delete process.env['GOOGLE_CLIENT_SECRET'];
    const service = new OAuthConfigService();
    expect(service.isGoogleConfigured()).toBe(false);

    process.env['GOOGLE_CLIENT_ID'] = 'client-id';
    expect(service.isGoogleConfigured()).toBe(false);

    process.env['GOOGLE_CLIENT_SECRET'] = 'client-secret';
    expect(service.isGoogleConfigured()).toBe(true);
  });

  it('reports both providers independently via getProviders', () => {
    process.env['GOOGLE_CLIENT_ID'] = 'g-id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'g-secret';
    delete process.env['MICROSOFT_CLIENT_ID'];
    delete process.env['MICROSOFT_CLIENT_SECRET'];

    const service = new OAuthConfigService();
    expect(service.getProviders()).toEqual({ google: true, microsoft: false });
  });
});
