import * as jwt from 'jsonwebtoken';
import { AppleStrategy } from './apple.strategy.js';

function fakeIdToken(claims: Record<string, unknown>): string {
  // jwt.decode() doesn't check the signature, so any signing key works -
  // this only needs to be a well-formed JWT, not a genuine Apple one.
  return jwt.sign(claims, 'test-secret');
}

describe('AppleStrategy.validate', () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    process.env['APPLE_CLIENT_ID'] = 'com.plexo.web';
    process.env['APPLE_TEAM_ID'] = 'TEAMID123';
    process.env['APPLE_KEY_ID'] = 'KEYID456';
    process.env['APPLE_PRIVATE_KEY'] = '-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----';
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds a validated profile from the id_token claims on a normal (non-first) login', () => {
    const strategy = new AppleStrategy();
    const idToken = fakeIdToken({ sub: 'apple-sub-1', email: 'user@privaterelay.appleid.com' });
    const done = jest.fn();

    strategy.validate({}, 'access-token', 'refresh-token', idToken, {}, done);

    expect(done).toHaveBeenCalledWith(null, {
      provider: 'APPLE',
      providerAccountId: 'apple-sub-1',
      email: 'user@privaterelay.appleid.com',
      name: undefined,
    });
  });

  it('includes the name only when req.appleProfile was populated (first login ever)', () => {
    const strategy = new AppleStrategy();
    const idToken = fakeIdToken({ sub: 'apple-sub-1', email: 'user@example.com' });
    const done = jest.fn();

    strategy.validate(
      { appleProfile: { name: { firstName: 'Juan', lastName: 'Pérez' } } },
      'access-token',
      'refresh-token',
      idToken,
      {},
      done,
    );

    expect(done).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'Juan Pérez' }),
    );
  });

  it('rejects when the id_token has no sub claim', () => {
    const strategy = new AppleStrategy();
    const idToken = fakeIdToken({ email: 'user@example.com' });
    const done = jest.fn();

    strategy.validate({}, 'access-token', 'refresh-token', idToken, {}, done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects when the id_token has no email claim', () => {
    const strategy = new AppleStrategy();
    const idToken = fakeIdToken({ sub: 'apple-sub-1' });
    const done = jest.fn();

    strategy.validate({}, 'access-token', 'refresh-token', idToken, {}, done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
  });

  it('rejects when the id_token cannot be decoded at all', () => {
    const strategy = new AppleStrategy();
    const done = jest.fn();

    strategy.validate({}, 'access-token', 'refresh-token', 'not-a-jwt', {}, done);

    expect(done).toHaveBeenCalledWith(expect.any(Error));
  });
});
