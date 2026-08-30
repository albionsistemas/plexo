import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConnectorService } from '@plexo/connectors';
import { PrismaService, withTenantContext } from '@plexo/database';
import { MercadoPagoConnector } from '@plexo/mercadopago';

/**
 * Fase 6 hardening (6.1) - proactive counterpart to MercadoPagoConnector's
 * own lazy refresh (Fase 2, still the last line of defense right before an
 * actual API call). Same daily list_tenant_ids() + withTenantContext +
 * try/catch-continue recipe as every other scheduler here (see
 * SubscriptionsSchedulerService's own docstring for why this needs its own
 * tenant loop instead of a request-scoped context - it runs outside any
 * HTTP request).
 *
 * Delegates the actual "is this close enough to expiry to refresh" decision
 * entirely to MercadoPagoConnector.getValidAccessToken/refreshIfNeeded (the
 * SAME 14-day margin as the lazy path, see that file) - this scheduler's
 * only job is to make sure that check runs once a day for every CONNECTED
 * tenant, even one that hasn't generated a payment link in months and would
 * otherwise never trigger the lazy path until someone finally did.
 */
@Injectable()
export class MercadoPagoRefreshSchedulerService {
  private readonly logger = new Logger(MercadoPagoRefreshSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorService: ConnectorService,
    private readonly mercadoPagoConnector: MercadoPagoConnector,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async refreshConnectedTenants(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const connector = await this.connectorService.getConnector('MERCADO_PAGO');
          if (!connector || connector.status !== 'CONNECTED') {
            return;
          }
          // Throws on a genuine refresh failure (handled by
          // refreshIfNeeded's own REVOKED/EXPIRED classification before
          // it ever gets here) - caught below so one tenant's dead
          // connection never stops the sweep for the rest.
          await this.mercadoPagoConnector.getValidAccessToken(connector.id);
        });
      } catch (err) {
        this.logger.error(
          `Failed to proactively refresh Mercado Pago token for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
