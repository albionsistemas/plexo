import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import type { OAuthValidatedProfile } from './oauth.types.js';

/**
 * Constructed exactly once at boot (Nest provider lifecycle) with whatever
 * GOOGLE_CLIENT_ID/SECRET are in env at that moment - unlike per-tenant AFIP
 * credentials (resolved per-request, see AfipCredentialsService), OAuth app
 * credentials are one instance-wide app registration, the same "global
 * config, not per-tenant" pattern as JWT_SECRET/RESEND_API_KEY. Falls back
 * to placeholder strings when unset so Nest can still boot the module -
 * GoogleOAuthGuard is what actually blocks the route before this strategy
 * would ever run unconfigured.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    const base = process.env['OAUTH_CALLBACK_BASE_URL'] ?? 'http://localhost:3000/api';
    super({
      clientID: process.env['GOOGLE_CLIENT_ID'] || 'not-configured',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || 'not-configured',
      callbackURL: `${base}/auth/oauth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google no devolvió un email para esta cuenta'));
      return;
    }

    const validated: OAuthValidatedProfile = {
      provider: 'GOOGLE',
      providerAccountId: profile.id,
      email,
      name: profile.displayName,
    };
    done(null, validated);
  }
}
