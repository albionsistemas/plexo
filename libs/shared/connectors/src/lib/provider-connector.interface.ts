import type { ConnectorProvider } from '@plexo/database';

/**
 * Contract every concrete integration (MercadoPagoConnector today;
 * Tiendanube/Mercado Libre later) implements so it can register itself in
 * ConnectorRegistry - the rest of the app (controllers, webhook handlers)
 * only ever depends on this interface, never on a specific provider's SDK.
 *
 * tenantId is explicit here (unlike ConnectorService, which reads it off
 * tenant-context) because the OAuth callback that drives
 * handleOAuthCallback() arrives before any tenant context exists for that
 * request - same reason login has to thread tenantId through by hand. The
 * implementation is expected to have carried tenantId across the redirect
 * itself (e.g. embedded in the signed `state`), not to trust it from the
 * request.
 */
export interface ProviderConnector {
  readonly provider: ConnectorProvider;
  getAuthorizationUrl(tenantId: string, state: string): string;
  /**
   * `state` is threaded through again here (not just at
   * getAuthorizationUrl) because PKCE's `code_verifier` never left the
   * server - it travels inside the signed `state` itself (see each
   * provider's own state service), so completing the exchange means
   * decoding the same `state` a second time, not receiving the verifier
   * separately.
   */
  handleOAuthCallback(tenantId: string, code: string, state: string): Promise<void>;
  refreshIfNeeded(connectorId: string): Promise<void>;
  disconnect(tenantId: string): Promise<void>;
}
