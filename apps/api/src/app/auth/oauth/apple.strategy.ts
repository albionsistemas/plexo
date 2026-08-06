import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import * as jwt from 'jsonwebtoken';
import { Strategy, type VerifyCallback } from 'passport-apple';
import type { OAuthValidatedProfile } from './oauth.types.js';

interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

interface RequestWithAppleProfile {
  appleProfile?: { name?: { firstName?: string; lastName?: string } };
}

/**
 * "Sign in with Apple" is OpenID Connect, not plain OAuth2 like
 * Google/Microsoft - there's no REST "userinfo" endpoint to call after the
 * token exchange. Identity comes from decoding the id_token JWT itself
 * (passport-apple hands it back raw as the 4th verify arg, undecoded on
 * purpose - see the package's own docstring). This is a read, not a
 * verification: signature/issuer/audience checks against Apple's JWKS are
 * deliberately NOT done here for the same reason RealElectronicInvoicingService
 * doesn't re-verify AFIP's own TLS chain - the token just came back over a
 * server-to-server HTTPS call this process itself made to
 * appleid.apple.com/auth/token (passport-apple's getOAuthAccessToken), so
 * there's no untrusted third party in the middle to forge it. Revisit if
 * this strategy ever accepts an id_token handed to it directly by a client
 * instead of fetching it itself.
 *
 * Client credentials are unlike Google/Microsoft's static secret: Apple
 * requires a client_secret that is itself a short-lived signed JWT (ES256,
 * built from APPLE_TEAM_ID/APPLE_KEY_ID/the .p8 private key) -
 * passport-apple generates and signs that on every token exchange
 * (see node_modules/passport-apple/src/token.js), nothing to build here.
 */
@Injectable()
export class AppleStrategy extends PassportStrategy(Strategy, 'apple') {
  constructor() {
    const base = process.env['OAUTH_CALLBACK_BASE_URL'] ?? 'http://localhost:3000/api';
    super({
      clientID: process.env['APPLE_CLIENT_ID'] || 'not-configured',
      teamID: process.env['APPLE_TEAM_ID'] || 'not-configured',
      keyID: process.env['APPLE_KEY_ID'] || 'not-configured',
      // .env files can't hold real newlines cleanly - the private key is
      // stored with literal "\n" escapes and unescaped here, same
      // convention used for any other PEM-in-env-var value.
      privateKeyString: (process.env['APPLE_PRIVATE_KEY'] || 'not-configured').replace(/\\n/g, '\n'),
      callbackURL: `${base}/auth/oauth/apple/callback`,
      passReqToCallback: true,
    });
  }

  validate(
    req: RequestWithAppleProfile,
    accessToken: string,
    refreshToken: string,
    idToken: string,
    profile: unknown,
    done: VerifyCallback,
  ): void {
    let claims: AppleIdTokenClaims;
    try {
      claims = jwt.decode(idToken) as AppleIdTokenClaims;
    } catch {
      done(new Error('No se pudo leer el id_token de Apple'));
      return;
    }
    if (!claims?.sub) {
      done(new Error('Apple no devolvió un id_token válido'));
      return;
    }
    if (!claims.email) {
      // No debería pasar con scope "email" (siempre viaja, real o relay de
      // "Hide My Email") salvo que el usuario nunca haya otorgado ese
      // scope - tratarlo como error explícito en vez de crear una cuenta
      // sin ningún email con el que loguear después.
      done(new Error('Apple no devolvió un email para esta cuenta'));
      return;
    }

    // Apple sólo manda el nombre la PRIMERA vez que este usuario autoriza
    // esta app - nunca en logins siguientes. AppleStrategy (el paquete) ya
    // lo parseó de req.body.user a req.appleProfile antes de llamar acá.
    const appleName = req.appleProfile?.name;
    const name = appleName ? [appleName.firstName, appleName.lastName].filter(Boolean).join(' ') : undefined;

    const validated: OAuthValidatedProfile = {
      provider: 'APPLE',
      providerAccountId: claims.sub,
      email: claims.email,
      name: name || undefined,
    };
    done(null, validated);
  }
}
