import { Injectable, Logger } from '@nestjs/common';
import { MPAuthenticationError, MPForbiddenError } from 'mercadopago';
import type { ConnectorProvider } from '@plexo/database';
import { ConnectorService, type ProviderConnector } from '@plexo/connectors';
import { codeChallengeFromVerifier } from './pkce.js';
import { MercadoPagoOAuthClient } from './mercadopago-oauth.client.js';
import { MercadoPagoStateService } from './mercadopago-state.service.js';

const PROVIDER: ConnectorProvider = 'MERCADO_PAGO';

/**
 * access_token lives 180 days (MP's own docs). One margin, used both by
 * the lazy check here (right before an actual API call) and by
 * MercadoPagoRefreshSchedulerService's daily proactive sweep (Fase 6) -
 * 14 days rather than the original 1 day: refreshing a 180-day token two
 * weeks early costs nothing real, and it means the daily cron can miss
 * up to ~2 weeks of runs (a deploy issue, a stuck server) before any
 * tenant's token is actually at risk of expiring unrefreshed - a single
 * missed run of a 1-day margin would have had zero slack.
 */
const REFRESH_MARGIN_MS = 14 * 24 * 60 * 60 * 1000;

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
      // oauthClient.refreshTokens already retried transient failures
      // internally (retryMercadoPagoCall) - by the time an error reaches
      // here, retries are exhausted. So this classification never fires
      // on an intermediate/transient 401, only on the final outcome:
      // - 401/403 (invalid_grant, a real revocation) -> REVOKED, and the
      //   now-dead tokens are cleared (Fase 6, 6.2) - there's nothing
      //   left worth keeping encrypted, MP already rejected them.
      // - anything else (network still down, MP 5xx persisting) ->
      //   EXPIRED, secrets left in place - could still be transient
      //   beyond what the retry budget covered, worth trying again later
      //   rather than throwing away a token that might still work.
      const revoked = err instanceof MPAuthenticationError || err instanceof MPForbiddenError;
      if (revoked) {
        await this.connectorService.clearSecrets(connectorId);
        await this.connectorService.setStatus(
          connectorId,
          'REVOKED',
          'Mercado Pago desautorizó el acceso (token inválido al refrescar) - hace falta reconectar',
        );
      } else {
        await this.connectorService.setStatus(
          connectorId,
          'EXPIRED',
          'No se pudo refrescar el token de Mercado Pago - hace falta reconectar',
        );
      }
      throw err;
    }
  }

  /**
   * Refresh-then-fetch as one operation - every caller that actually needs
   * to talk to the MP API on this tenant's behalf (payment links today,
   * the webhook's payment lookup in Fase 4 later) wants this, not
   * refreshIfNeeded()+getSecret() duplicated at each call site. Throws if
   * there's simply no access_token stored yet (never connected) - a
   * distinct, callable-earlier failure from "refresh failed", which
   * refreshIfNeeded already turns into an EXPIRED status instead of a
   * throw when there's no refresh_token to try.
   */
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
