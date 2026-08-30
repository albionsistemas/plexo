import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

const PURPOSE = 'connector_oauth_state';
const TTL = '10m';

interface McpOAuthStatePayload {
  tenantId: string;
  userId: string;
  codeVerifier: string;
  purpose: typeof PURPOSE;
}

export type McpOAuthState = Omit<McpOAuthStatePayload, 'purpose'>;

/**
 * Signs/verifies the OAuth `state` param (section 2.4 of the plan) as a
 * short-lived JWT using the app's existing, already-global JwtService
 * (same JWT_SECRET as session tokens, registered `global: true` in
 * AuthModule) - no new table or cache needed. The PKCE `code_verifier`
 * rides inside this same signed token (see pkce.ts), so it never needs its
 * own storage either: whoever can verify `state` already gets the verifier
 * back out.
 *
 * `purpose` guards against a state token being replayed as a session
 * token or vice versa - both are HS256 JWTs signed with the same secret,
 * so the claim shape alone is what tells them apart.
 *
 * Uses JwtService's SYNC sign()/verify() (not signAsync/verifyAsync) on
 * purpose: ProviderConnector.getAuthorizationUrl is a sync method (see its
 * doc comment), and MercadoPagoConnector needs to decode `state` back out
 * inside it to recover codeVerifier - jsonwebtoken's underlying verify is
 * sync either way, signAsync/verifyAsync just wrap it in a Promise for API
 * symmetry with other JwtService callers, so nothing is lost by using the
 * sync form here.
 */
@Injectable()
export class MercadoPagoStateService {
  constructor(private readonly jwtService: JwtService) {}

  sign(state: McpOAuthState): string {
    return this.jwtService.sign({ ...state, purpose: PURPOSE }, { expiresIn: TTL });
  }

  /** Throws UnauthorizedException on an invalid, expired, or wrong-purpose
   * token - the callback endpoint is @Public(), this is the only thing
   * standing between it and an unauthenticated caller. */
  verify(state: string): McpOAuthState {
    let payload: McpOAuthStatePayload;
    try {
      payload = this.jwtService.verify<McpOAuthStatePayload>(state);
    } catch {
      throw new UnauthorizedException(
        'El enlace de autorización de Mercado Pago venció o no es válido - probá conectar de nuevo',
      );
    }
    if (payload.purpose !== PURPOSE) {
      throw new UnauthorizedException(
        'El enlace de autorización de Mercado Pago venció o no es válido - probá conectar de nuevo',
      );
    }
    const { tenantId, userId, codeVerifier } = payload;
    return { tenantId, userId, codeVerifier };
  }
}
