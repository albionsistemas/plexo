import { Injectable } from '@nestjs/common';

const DEFAULT_API_VERSION = '2025-03';

/**
 * Single place that reads TIENDANUBE_* env vars - same "isConfigured()
 * instead of throwing at boot" convention as MercadoPagoConfigService: a
 * tenant clicking "Conectar Tiendanube" before an ops person has loaded
 * real app credentials into this environment should get a clear 400, not a
 * 500 from a service that failed to construct.
 *
 * Unlike Mercado Pago, there's no platform-level access token needed here -
 * Tiendanube's OAuth app_id/authorize URL don't require the app itself to
 * authenticate as anything before a tenant starts the flow.
 */
@Injectable()
export class TiendanubeConfigService {
  get appId(): string | undefined {
    return process.env['TIENDANUBE_APP_ID'];
  }

  get clientSecret(): string | undefined {
    return process.env['TIENDANUBE_CLIENT_SECRET'];
  }

  /** Must match, byte for byte, the redirect URL configured for this app in
   * Tiendanube's Partner panel - Tiendanube does NOT accept a redirect_uri
   * query param on the authorize URL nor in the token exchange body
   * (confirmed against the official doc, see PLAN_TIENDANUBE.md/PROGRESS.md
   * session 2026-08-30), so this env var is never sent to Tiendanube in any
   * request; it only gates isConfigured() and documents what the panel must
   * have configured. */
  get redirectUri(): string | undefined {
    return process.env['TIENDANUBE_OAUTH_REDIRECT_URI'];
  }

  /** Required on every request to Tiendanube's API (and recommended on the
   * OAuth calls too) - format is "AppName (contact-url-or-email)", e.g.
   * "OPLEX (soporte@oplex.com.ar)". Confirmed against the official doc: a
   * missing/malformed User-Agent gets the request rejected. */
  get userAgent(): string | undefined {
    return process.env['TIENDANUBE_APP_USER_AGENT'];
  }

  /** Tiendanube versions its API by release date in the URL
   * (`/2025-03/{store_id}/...`), not `/v1/...` as PLAN_TIENDANUBE.md
   * originally assumed - kept as an env var instead of hardcoded so a
   * future API version bump doesn't need a code change. */
  get apiVersion(): string {
    return process.env['TIENDANUBE_API_VERSION'] ?? DEFAULT_API_VERSION;
  }

  isConfigured(): boolean {
    return Boolean(this.appId && this.clientSecret && this.redirectUri && this.userAgent);
  }

  /** Pure string building - the merchant's browser is redirected here to
   * grant/deny access. `state` is the only query param Tiendanube's
   * authorize endpoint accepts and echoes back on the callback (confirmed
   * against the official doc), used here purely for CSRF - see
   * TiendanubeStateService. */
  authorizeUrl(state: string): string {
    return `https://www.tiendanube.com/apps/${this.appId}/authorize?state=${encodeURIComponent(state)}`;
  }

  /** Fixed endpoint, not store-scoped (the store isn't known yet at this
   * point in the flow - it comes back IN the token response as user_id). */
  get tokenUrl(): string {
    return 'https://www.tiendanube.com/apps/authorize/token';
  }

  /** Every resource call is scoped under the store's id in the path
   * itself, not a header or query param. */
  apiBaseUrl(storeId: string): string {
    return `https://api.tiendanube.com/${this.apiVersion}/${storeId}`;
  }
}
