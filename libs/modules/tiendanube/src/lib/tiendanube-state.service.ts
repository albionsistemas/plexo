import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const PURPOSE = 'tiendanube_oauth_state';
const TTL = '10m';

interface TiendanubeOAuthStatePayload {
  tenantId: string;
  userId: string;
  purpose: typeof PURPOSE;
}

export type TiendanubeOAuthState = Omit<TiendanubeOAuthStatePayload, 'purpose'>;

/**
 * Signs/verifies the OAuth `state` param as a short-lived JWT, same
 * mechanism as MercadoPagoStateService (reusing the app's existing, already
 * -global JwtService - no new table or cache needed). Simpler than MP's
 * counterpart: Tiendanube's OAuth has no PKCE, so `state` only ever needs
 * to carry tenantId/userId for CSRF + identifying who's completing the
 * flow, never a code_verifier.
 *
 * `purpose` guards against a state token being replayed as a session token
 * or vice versa - both are HS256 JWTs signed with the same secret, so the
 * claim shape alone is what tells them apart.
 */
@Injectable()
export class TiendanubeStateService {
  constructor(private readonly jwtService: JwtService) {}

  sign(state: TiendanubeOAuthState): string {
    return this.jwtService.sign({ ...state, purpose: PURPOSE }, { expiresIn: TTL });
  }

  /** Throws UnauthorizedException on an invalid, expired, or wrong-purpose
   * token - the callback endpoint is @Public(), this is the only thing
   * standing between it and an unauthenticated caller. */
  verify(state: string): TiendanubeOAuthState {
    let payload: TiendanubeOAuthStatePayload;
    try {
      payload = this.jwtService.verify<TiendanubeOAuthStatePayload>(state);
    } catch {
      throw new UnauthorizedException(
        'El enlace de autorización de Tiendanube venció o no es válido - probá conectar de nuevo',
      );
    }
    if (payload.purpose !== PURPOSE) {
      throw new UnauthorizedException(
        'El enlace de autorización de Tiendanube venció o no es válido - probá conectar de nuevo',
      );
    }
    const { tenantId, userId } = payload;
    return { tenantId, userId };
  }
}
