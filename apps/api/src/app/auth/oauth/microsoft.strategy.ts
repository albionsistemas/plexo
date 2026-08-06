import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-microsoft';
import type { OAuthValidatedProfile } from './oauth.types.js';

/** Same boot-time/placeholder reasoning as GoogleStrategy. Uses the OAuth2
 * v2 Microsoft identity platform endpoint (passport-microsoft, actively
 * maintained) rather than the deprecated passport-azure-ad. MICROSOFT_TENANT_ID
 * defaults to 'common' - lets both work/school and personal Microsoft
 * accounts sign in, not just one Azure AD tenant. */
@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor() {
    const base = process.env['OAUTH_CALLBACK_BASE_URL'] ?? 'http://localhost:3000/api';
    super({
      clientID: process.env['MICROSOFT_CLIENT_ID'] || 'not-configured',
      clientSecret: process.env['MICROSOFT_CLIENT_SECRET'] || 'not-configured',
      callbackURL: `${base}/auth/oauth/microsoft/callback`,
      tenant: process.env['MICROSOFT_TENANT_ID'] ?? 'common',
      scope: ['user.read'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback): void {
    const email = profile.emails?.[0]?.value ?? profile.userPrincipalName;
    if (!email) {
      done(new Error('Microsoft no devolvió un email para esta cuenta'));
      return;
    }

    const validated: OAuthValidatedProfile = {
      provider: 'MICROSOFT',
      providerAccountId: profile.id,
      email,
      name: profile.displayName,
    };
    done(null, validated);
  }
}
