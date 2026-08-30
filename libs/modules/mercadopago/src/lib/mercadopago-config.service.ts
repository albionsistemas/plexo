import { Injectable } from '@nestjs/common';

/**
 * Single place that reads MP_* env vars - same "isConfigured() instead of
 * throwing at boot" convention as OAuthConfigService (apps/api's Google/
 * Microsoft/Apple config): a tenant clicking "Conectar Mercado Pago" before
 * an ops person has loaded real MP credentials into this environment
 * should get a clear 400, not a 500 from a service that failed to
 * construct.
 *
 * MP_ACCESS_TOKEN is OPLEX's own platform-level MP access token (the
 * integrator's, not any tenant's) - the official SDK's OAuth client
 * requires a MercadoPagoConfig with an accessToken even to call
 * POST /oauth/token on a tenant's behalf (confirmed by reading the
 * installed `mercadopago` package's own oAuth/create implementation: it
 * sends `Authorization: Bearer <config.accessToken>` on that call). Not
 * listed in the plan's section 2.2 - a real requirement the SDK surfaced,
 * not something invented here.
 */
@Injectable()
export class MercadoPagoConfigService {
  get clientId(): string | undefined {
    return process.env['MP_CLIENT_ID'];
  }

  get clientSecret(): string | undefined {
    return process.env['MP_CLIENT_SECRET'];
  }

  get redirectUri(): string | undefined {
    return process.env['MP_OAUTH_REDIRECT_URI'];
  }

  get accessToken(): string | undefined {
    return process.env['MP_ACCESS_TOKEN'];
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri && this.accessToken);
  }
}
