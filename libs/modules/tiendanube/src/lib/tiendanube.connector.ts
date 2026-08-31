import { Injectable, Logger } from '@nestjs/common';
import type { ConnectorProvider } from '@plexo/database';
import { ConnectorService, type ProviderConnector } from '@plexo/connectors';
import { TiendanubeOAuthClient } from './tiendanube-oauth.client.js';

const PROVIDER: ConnectorProvider = 'TIENDANUBE';

@Injectable()
export class TiendanubeConnector implements ProviderConnector {
  readonly provider = PROVIDER;

  private readonly logger = new Logger(TiendanubeConnector.name);

  constructor(
    private readonly connectorService: ConnectorService,
    private readonly oauthClient: TiendanubeOAuthClient,
  ) {}

  /**
   * Sync (interface contract). Unlike MercadoPagoConnector, there's no PKCE
   * code_challenge to derive - `state` only needs to make the round trip
   * for CSRF, so this is a straight pass-through to the config-driven URL
   * builder.
   */
  getAuthorizationUrl(_tenantId: string, state: string): string {
    return this.oauthClient.buildAuthorizationUrl(state);
  }

  /**
   * Assumes the caller (TiendanubeController.callback) already verified
   * `state` once to resolve `tenantId` and open tenant context before
   * calling this - no PKCE verifier to recover here, so unlike
   * MercadoPagoConnector.handleOAuthCallback there's no need to re-verify
   * `state` a second time inside this method (kept as an optional
   * parameter purely to match ProviderConnector's signature - the
   * controller still passes it, this implementation just never reads it).
   */
  async handleOAuthCallback(_tenantId: string, code: string, _state?: string): Promise<void> {
    const connector = await this.connectorService.getOrCreateConnector(PROVIDER);

    let tokens;
    try {
      tokens = await this.oauthClient.exchangeCodeForToken(code);
    } catch (err) {
      await this.connectorService.setStatus(
        connector.id,
        'ERROR',
        'No se pudo completar la vinculación con Tiendanube',
      );
      throw err;
    }

    if (!tokens.access_token || tokens.user_id == null) {
      await this.connectorService.setStatus(
        connector.id,
        'ERROR',
        'Tiendanube devolvió una respuesta incompleta (sin access_token/user_id)',
      );
      throw new Error('Incomplete OAuth token response from Tiendanube');
    }

    const storeId = String(tokens.user_id);
    // No expiresAt - Tiendanube's access tokens don't expire (confirmed
    // against the official doc: "only after you get a new one, or if the
    // user uninstalls your app"). See refreshIfNeeded below.
    await this.connectorService.saveSecret(connector.id, 'access_token', tokens.access_token);

    // Best-effort, never blocks the connection - see fetchStoreName's own
    // doc comment.
    const storeName = await this.oauthClient.fetchStoreName(tokens.access_token, storeId).catch((err) => {
      this.logger.warn(`No se pudo obtener el nombre de la tienda de Tiendanube: ${err}`);
      return undefined;
    });

    await this.connectorService.finishConnecting(connector.id, {
      externalAccountId: storeId,
      externalNickname: storeName,
      scopes: tokens.scope,
    });
  }

  /**
   * No-op by design: Tiendanube's access tokens don't expire (see
   * handleOAuthCallback's doc comment), so there's no time-based refresh to
   * perform - unlike MercadoPagoConnector.refreshIfNeeded, which actually
   * calls the provider. The only real invalidation is the merchant
   * revoking access from Tiendanube's side, which surfaces as a 401 on an
   * actual API call (TiendanubeAuthError from TiendanubeApiClient) - Fase
   * 6 hardening (per PLAN_TIENDANUBE.md section 7.1) is where a caller that
   * catches that error marks the connector REVOKED, same as an
   * `app/uninstalled` webhook would. Kept as a real (awaited) no-op, not
   * removed, to satisfy the ProviderConnector contract that every other
   * caller (a future scheduled job enumerating connectors, say) can rely
   * on unconditionally.
   */
  async refreshIfNeeded(_connectorId: string): Promise<void> {
    return;
  }

  /** Returns the stored access_token as-is (refreshIfNeeded is a no-op, see
   * above) - kept as its own method, mirroring
   * MercadoPagoConnector.getValidAccessToken, so every future caller that
   * needs "a usable token for this connector" (the Fase 2 order sync, the
   * Fase 3/4 stock and catalog pushes) has one place to ask, not
   * `getSecret` sprinkled at each call site. */
  async getValidAccessToken(connectorId: string): Promise<string> {
    await this.refreshIfNeeded(connectorId);
    const accessToken = await this.connectorService.getSecret(connectorId, 'access_token');
    if (!accessToken) {
      throw new Error('No hay access_token guardado para este connector');
    }
    return accessToken;
  }

  /** tenantId kept for interface symmetry with getAuthorizationUrl/
   * handleOAuthCallback - ConnectorService.disconnect already scopes to
   * getTenantId() internally, this method always runs inside that same
   * tenant's context (called from the normally-authenticated
   * POST /disconnect route). */
  disconnect(_tenantId: string): Promise<void> {
    return this.connectorService.disconnect(PROVIDER);
  }
}
