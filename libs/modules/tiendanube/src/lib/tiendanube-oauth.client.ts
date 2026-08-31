import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { TiendanubeConfigService } from './tiendanube-config.service.js';
import { TiendanubeApiError } from './tiendanube-errors.js';

export interface TiendanubeTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  /** This IS the store id (confirmed against the official doc) - Tiendanube
   * overloads the OAuth spec's generic `user_id` field for it, there's no
   * separate `store_id` in the token response. */
  user_id: number;
}

/** `name`/`description` on Tiendanube resources are language-keyed objects,
 * not plain strings (confirmed against the official doc) - a store with
 * only one storefront language still returns an object with just that one
 * key. */
export interface TiendanubeStore {
  id: number;
  name: Record<string, string>;
  main_language?: string;
}

/**
 * Thin wrapper around Tiendanube's OAuth endpoints - no official Node SDK
 * exists for Tiendanube (unlike Mercado Pago's), so this is hand-rolled
 * against the documented HTTP contract. Isolates the raw `fetch` calls to
 * this one file, mockable in TiendanubeConnector's tests without touching
 * the network at all.
 */
@Injectable()
export class TiendanubeOAuthClient {
  constructor(private readonly config: TiendanubeConfigService) {}

  private assertConfigured(): void {
    if (!this.config.isConfigured()) {
      throw new ServiceUnavailableException(
        'Tiendanube no está configurado en este servidor - faltan TIENDANUBE_APP_ID/TIENDANUBE_CLIENT_SECRET/TIENDANUBE_OAUTH_REDIRECT_URI/TIENDANUBE_APP_USER_AGENT',
      );
    }
  }

  /** Pure string building, no network call - safe to call from the sync
   * ProviderConnector.getAuthorizationUrl. */
  buildAuthorizationUrl(state: string): string {
    this.assertConfigured();
    return this.config.authorizeUrl(state);
  }

  /**
   * POST .../apps/authorize/token. Per the official doc, the body carries
   * ONLY client_id/client_secret/grant_type/code - NEITHER redirect_uri NOR
   * state, unlike a textbook OAuth2 exchange (confirmed against the
   * official doc, not assumed). Throws TiendanubeApiError on a non-2xx
   * response.
   */
  async exchangeCodeForToken(code: string): Promise<TiendanubeTokenResponse> {
    this.assertConfigured();
    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': this.config.userAgent as string,
      },
      body: JSON.stringify({
        client_id: this.config.appId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!response.ok) {
      throw new TiendanubeApiError(
        `Tiendanube rechazó el intercambio de código por token (status ${response.status})`,
        response.status,
      );
    }
    return (await response.json()) as TiendanubeTokenResponse;
  }

  /**
   * Best-effort store name for the UI (Connector.externalNickname) - never
   * blocks or fails the connection: callers should swallow a rejection
   * here and leave the nickname null rather than treat it as a failed
   * link (the token is already valid at this point either way), same
   * convention as MercadoPagoOAuthClient.fetchAccountNickname.
   */
  async fetchStoreName(accessToken: string, storeId: string): Promise<string | undefined> {
    const response = await fetch(`${this.config.apiBaseUrl(storeId)}/store`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': this.config.userAgent as string,
      },
    });
    if (!response.ok) {
      return undefined;
    }
    const store = (await response.json()) as TiendanubeStore;
    if (!store.name) {
      return undefined;
    }
    return (store.main_language && store.name[store.main_language]) || Object.values(store.name)[0];
  }
}
