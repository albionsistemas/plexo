import { Injectable, Logger } from '@nestjs/common';
import type { ConnectorProvider } from '@plexo/database';
import { ConnectorService, type ProviderConnector } from '@plexo/connectors';
import { codeChallengeFromVerifier } from './pkce.js';
import { MercadoPagoOAuthClient } from './mercadopago-oauth.client.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';

const PROVIDER: ConnectorProvider = 'MERCADO_PAGO';

/** access_token lives 180 days (MP's own docs) - refresh a full day before
 * that so a slightly-stale check never leaves a payment link generation
 * (Fase 3) working against an access_token that expires mid-request. */
const REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class MercadoPagoConnector implements ProviderConnector {
  readonly provider = PROVIDER;

  private readonly logger = new Logger(MercadoPagoConnector.name);

  constructor(
    private readonly connectorService: ConnectorService,
    private readonly oauthClient: MercadoPagoOAuthClient,
    private readonly stateService: MercadoPagoStateService,
  ) {}

  /**
   * Sync (interface contract) - re-verifies the SAME `state` the caller
   * just signed a moment earlier (see MercadoPagoController.authorize) to
   * recover codeVerifier without a second parameter; jsonwebtoken's verify
   * is sync under the hood either way (see MercadoPagoStateService).
   */
  getAuthorizationUrl(_tenantId: string, state: string): string {
    const { codeVerifier } = this.stateService.verify(state);
    const codeChallenge = codeChallengeFromVerifier(codeVerifier);
    return this.oauthClient.buildAuthorizationUrl({ state, codeChallenge });
  }

  /**
   * Assumes the caller (MercadoPagoController.callback) already verified
   * `state` once to resolve `tenantId` and open tenant context before
   * calling this - re-verifying here recovers codeVerifier for the token
   * exchange itself, not to re-authenticate the request.
   */
  async handleOAuthCallback(tenantId: string, code: string, state: string): Promise<void> {
    const { codeVerifier } = this.stateService.verify(state);
    const connector = await this.connectorService.getOrCreateConnector(PROVIDER);

    let tokens;
    try {
      tokens = await this.oauthClient.exchangeCodeForTokens({ code, codeVerifier });
    } catch (err) {
      await this.connectorService.setStatus(
        connector.id,
        'ERROR',
        'No se pudo completar la vinculación con Mercado Pago',
      );
      throw err;
    }

    if (!tokens.access_token || !tokens.refresh_token) {
      await this.connectorService.setStatus(
        connector.id,
        'ERROR',
        'Mercado Pago devolvió una respuesta incompleta (sin access_token/refresh_token)',
      );
      throw new Error('Incomplete OAuth token response from Mercado Pago');
    }

    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined;
    await this.connectorService.saveSecret(connector.id, 'access_token', tokens.access_token, expiresAt);
    await this.connectorService.saveSecret(connector.id, 'refresh_token', tokens.refresh_token);

    // Best-effort, never blocks the connection - see fetchAccountNickname's
    // own doc comment.
    const nickname = await this.oauthClient.fetchAccountNickname(tokens.access_token).catch((err) => {
      this.logger.warn(`No se pudo obtener el nickname de la cuenta de Mercado Pago: ${err}`);
      return undefined;
    });

    await this.connectorService.finishConnecting(connector.id, {
      externalAccountId: tokens.user_id != null ? String(tokens.user_id) : undefined,
      externalNickname: nickname,
      scopes: tokens.scope,
    });
  }

  async refreshIfNeeded(connectorId: string): Promise<void> {
    const meta = await this.connectorService.getSecretMeta(connectorId, 'access_token');
    if (meta?.expiresAt && meta.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) {
      return;
    }

    const refreshToken = await this.connectorService.getSecret(connectorId, 'refresh_token');
    if (!refreshToken) {
      await this.connectorService.setStatus(connectorId, 'EXPIRED', 'No hay refresh_token guardado');
      return;
    }

    try {
      const tokens = await this.oauthClient.refreshTokens(refreshToken);
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Incomplete OAuth refresh response from Mercado Pago');
      }
      const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined;
      await this.connectorService.saveSecret(connectorId, 'access_token', tokens.access_token, expiresAt);
      // MP rotates the refresh_token on every use - always store the new one.
      await this.connectorService.saveSecret(connectorId, 'refresh_token', tokens.refresh_token);
      await this.connectorService.setStatus(connectorId, 'CONNECTED');
    } catch (err) {
      await this.connectorService.setStatus(
        connectorId,
        'EXPIRED',
        'No se pudo refrescar el token de Mercado Pago - hace falta reconectar',
      );
      throw err;
    }
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
