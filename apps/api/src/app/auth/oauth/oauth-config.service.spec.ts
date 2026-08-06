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

  it('reports the 3 providers independently via getProviders', () => {
    process.env['GOOGLE_CLIENT_ID'] = 'g-id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'g-secret';
    delete process.env['MICROSOFT_CLIENT_ID'];
    delete process.env['MICROSOFT_CLIENT_SECRET'];
    delete process.env['APPLE_CLIENT_ID'];
    delete process.env['APPLE_TEAM_ID'];
    delete process.env['APPLE_KEY_ID'];
    delete process.env['APPLE_PRIVATE_KEY'];

    const service = new OAuthConfigService();
    expect(service.getProviders()).toEqual({ google: true, microsoft: false, apple: false });
  });

  it('reports Apple as configured only once all 4 of its env vars are set', () => {
    delete process.env['APPLE_CLIENT_ID'];
    delete process.env['APPLE_TEAM_ID'];
    delete process.env['APPLE_KEY_ID'];
    delete process.env['APPLE_PRIVATE_KEY'];
    const service = new OAuthConfigService();
    expect(service.isAppleConfigured()).toBe(false);

    process.env['APPLE_CLIENT_ID'] = 'com.plexo.web';
    process.env['APPLE_TEAM_ID'] = 'TEAMID123';
    process.env['APPLE_KEY_ID'] = 'KEYID456';
    expect(service.isAppleConfigured()).toBe(false);

    process.env['APPLE_PRIVATE_KEY'] = '-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----';
    expect(service.isAppleConfigured()).toBe(true);
  });
});
