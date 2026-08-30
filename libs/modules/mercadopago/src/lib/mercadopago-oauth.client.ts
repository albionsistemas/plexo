import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { MercadoPagoConfig, OAuth } from 'mercadopago';
import type { AuthorizationRequest } from 'mercadopago/dist/clients/oAuth/getAuthorizationURL/types.js';
import type { OAuthRequest } from 'mercadopago/dist/clients/oAuth/create/types.js';
import type { OAuthResponse } from 'mercadopago/dist/clients/oAuth/commonTypes.js';
import { MercadoPagoConfigService } from './mercadopago-config.service.js';
import { retryMercadoPagoCall } from './mercadopago-retry.util.js';

/**
 * The installed SDK's own .d.ts under-declares both of these: neither
 * AuthorizationRequest nor OAuthRequest models the PKCE fields, even though
 * MP's real API accepts them (confirmed against the official docs) and the
 * SDK's own implementation forwards every own-enumerable key verbatim
 * (RestClient.appendQueryParamsToUrl does a plain `for...in`; oAuth/create's
 * body is `Object.assign({}, body, {...})`) - a narrow typing gap, not a
 * functional one. These two local types are the accurate contract; the
 * SDK's are missing fields, not wrong about the ones they do declare.
 */
type AuthorizationRequestWithPkce = AuthorizationRequest & {
  code_challenge: string;
  code_challenge_method: 'S256';
};
type OAuthRequestWithPkce = OAuthRequest & { code_verifier: string };

/**
 * Thin wrapper around the official `mercadopago` SDK's OAuth client -
 * isolates the SDK dependency to this one file (mockable in
 * MercadoPagoConnector's tests without touching the SDK at all) and hides
 * the PKCE typing workaround above from every caller.
 */
@Injectable()
export class MercadoPagoOAuthClient {
  constructor(private readonly config: MercadoPagoConfigService) {}

  private sdk(): OAuth {
    if (!this.config.isConfigured()) {
      throw new ServiceUnavailableException(
        'Mercado Pago no está configurado en este servidor - faltan MP_CLIENT_ID/MP_CLIENT_SECRET/MP_OAUTH_REDIRECT_URI/MP_ACCESS_TOKEN',
      );
    }
    return new OAuth(new MercadoPagoConfig({ accessToken: this.config.accessToken as string }));
  }

  /** Pure string building, no network call - safe to call from the sync
   * ProviderConnector.getAuthorizationUrl. */
  buildAuthorizationUrl(params: { state: string; codeChallenge: string }): string {
    const options: AuthorizationRequestWithPkce = {
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    };
    return this.sdk().getAuthorizationURL({ options });
  }

  /** POST /oauth/token, grant_type=authorization_code (added by the SDK
   * itself). Throws (MercadoPagoError subtype) on a non-2xx response - see
   * the installed package's RestClient.fetch. */
  exchangeCodeForTokens(params: { code: string; codeVerifier: string }): Promise<OAuthResponse> {
    const body: OAuthRequestWithPkce = {
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code: params.code,
      redirect_uri: this.config.redirectUri,
      code_verifier: params.codeVerifier,
    };
    return this.sdk().create({ body });
  }

  /**
   * POST /oauth/token, grant_type=refresh_token. The response's own
   * refresh_token is a NEW one (MP rotates it on every refresh) - callers
   * must store it, never keep reusing the one passed in here.
   *
   * Wrapped in retryMercadoPagoCall (Fase 6 hardening) - a transient
   * network blip or MP 5xx here shouldn't flip a tenant's connector to
   * EXPIRED/REVOKED on the first try. A 401/403 (invalid_grant, real
   * revocation) is NOT retryable by design (see the util's own doc
   * comment), so MercadoPagoConnector.refreshIfNeeded's REVOKED
   * classification always runs on the FINAL error, after retries are
   * already exhausted - never on an intermediate one.
   */
  refreshTokens(refreshToken: string): Promise<OAuthResponse> {
    return retryMercadoPagoCall(() =>
      this.sdk().refresh({
        body: {
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
        },
      }),
    );
  }

  /**
   * Best-effort account nickname for the UI (Connector.externalNickname) -
   * MP's general Users API, not part of the OAuth spec itself. Never
   * blocks or fails the connection: callers should swallow a rejection
   * here and leave the nickname null rather than treat it as a failed
   * link (the tokens are already valid at this point either way).
   */
  async fetchAccountNickname(accessToken: string): Promise<string | undefined> {
    const response = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      return undefined;
    }
    const body = (await response.json()) as { nickname?: string };
    return body.nickname;
  }
}
