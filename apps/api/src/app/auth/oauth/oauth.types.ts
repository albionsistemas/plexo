export type OAuthProviderName = 'GOOGLE' | 'MICROSOFT' | 'APPLE';

/** What both strategies' validate() normalize their provider-specific
 * profile shape into, before OAuthService ever sees it - OAuthController
 * reads this off request.user (Passport's convention) in the callback
 * route. */
export interface OAuthValidatedProfile {
  provider: OAuthProviderName;
  providerAccountId: string;
  email: string;
  name?: string;
}
