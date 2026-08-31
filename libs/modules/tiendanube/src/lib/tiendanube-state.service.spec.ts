import { JwtService } from '@nestjs/jwt';
import { TiendanubeStateService } from './tiendanube-state.service.js';

const SECRET = 'test-jwt-secret';

function makeService(secret = SECRET): TiendanubeStateService {
  return new TiendanubeStateService(new JwtService({ secret }));
}

describe('TiendanubeStateService', () => {
  it('round-trips tenantId/userId through sign+verify', () => {
    const service = makeService();
    const state = service.sign({ tenantId: 'tenant-1', userId: 'user-1' });

    const result = service.verify(state);

    expect(result).toEqual({ tenantId: 'tenant-1', userId: 'user-1' });
  });

  it('rejects a tampered token instead of returning corrupted claims', () => {
    const service = makeService();
    const state = service.sign({ tenantId: 'tenant-1', userId: 'user-1' });
    const tampered = `${state.slice(0, -1)}${state.at(-1) === 'a' ? 'b' : 'a'}`;

    expect(() => service.verify(tampered)).toThrow(
      'El enlace de autorización de Tiendanube venció o no es válido - probá conectar de nuevo',
    );
  });

  it('rejects a token signed with a different secret (never trusts a forged state)', () => {
    const forger = makeService('a-different-secret-entirely');
    const state = forger.sign({ tenantId: 'tenant-attacker', userId: 'user-1' });
    const victim = makeService();

    expect(() => victim.verify(state)).toThrow();
  });

  it('rejects a well-formed JWT from this same secret that lacks the tiendanube_oauth_state purpose', () => {
    const jwt = new JwtService({ secret: SECRET });
    const service = new TiendanubeStateService(jwt);
    // A session-shaped token, signed with the SAME secret the state
    // service uses (JWT_SECRET is shared app-wide) - purpose is what must
    // keep it from being replayed as OAuth state.
    const sessionLikeToken = jwt.sign({ sub: 'user-1', tenantId: 'tenant-1', role: 'OWNER' });

    expect(() => service.verify(sessionLikeToken)).toThrow(
      'El enlace de autorización de Tiendanube venció o no es válido - probá conectar de nuevo',
    );
  });

  it('rejects a state token minted for Mercado Pago (same secret, different purpose)', () => {
    const jwt = new JwtService({ secret: SECRET });
    const service = new TiendanubeStateService(jwt);
    const mpState = jwt.sign(
      { tenantId: 'tenant-1', userId: 'user-1', codeVerifier: 'x', purpose: 'connector_oauth_state' },
      { expiresIn: '10m' },
    );

    expect(() => service.verify(mpState)).toThrow();
  });

  it('rejects an expired state token', () => {
    const jwt = new JwtService({ secret: SECRET });
    const service = new TiendanubeStateService(jwt);
    const expired = jwt.sign(
      { tenantId: 'tenant-1', userId: 'user-1', purpose: 'tiendanube_oauth_state' },
      { expiresIn: '-1s' },
    );

    expect(() => service.verify(expired)).toThrow(
      'El enlace de autorización de Tiendanube venció o no es válido - probá conectar de nuevo',
    );
  });
});
