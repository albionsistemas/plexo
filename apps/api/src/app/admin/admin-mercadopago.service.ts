import { Injectable, Logger } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import type { WebhookEvent } from '@plexo/database';

export interface MercadoPagoMetrics {
  /** "links creados" (por estado) - PaymentIntent, cross-tenant. */
  paymentIntentsByStatus: Record<string, number>;
  /** Conectores de Mercado Pago por estado, cross-tenant - "refresh
   * fallidos" se lee como el snapshot actual de EXPIRED+REVOKED (no hay
   * un log dedicado de intentos de refresh, ver el método de abajo). */
  connectorsByStatus: Record<string, number>;
  webhooks: {
    totalLast7Days: number;
    invalidSignatureLast7Days: number;
    /** 0..1 - "tasa de firmas inválidas" (6.4). */
    invalidSignatureRate: number;
    /** null si no hubo ningún webhook de pago procesado en la ventana.
     * Promedio de (processedAt - receivedAt) sobre eventos type=payment
     * processed=true - proxy razonable de "latencia webhook -> asiento"
     * (no todos son necesariamente un asiento real - un ack sin
     * reconciliar también cuenta como "processed" - pero es la métrica
     * derivable sin una tabla de eventos más granular). */
    avgProcessingLatencyMs: number | null;
  };
}

const PAYMENT_INTENT_STATUSES = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'ERROR'];
const CONNECTOR_STATUSES = ['PENDING', 'CONNECTED', 'EXPIRED', 'REVOKED', 'ERROR', 'DISCONNECTED'];
const METRICS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Fase 6 observability (6.4) - derived-on-read metrics, same philosophy
 * as the rest of the Backoffice (e.g. "Facturas emitidas este mes, por
 * tenant" in /admin): no metrics SDK/Prometheus in this project, so this
 * computes real numbers from the same tables the feature already writes,
 * rather than adding a new observability stack for one integration.
 *
 * webhook_events is global (no RLS, see its own schema.prisma doc
 * comment) - queried directly, no tenant loop needed. paymentIntents/
 * connectors ARE tenant-scoped, so those two need the same
 * list_tenant_ids() + withTenantContext sweep AdminAuditService already
 * uses, merged in memory.
 */
@Injectable()
export class AdminMercadoPagoService {
  private readonly logger = new Logger(AdminMercadoPagoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getMetrics(): Promise<MercadoPagoMetrics> {
    const paymentIntentsByStatus = Object.fromEntries(PAYMENT_INTENT_STATUSES.map((s) => [s, 0]));
    const connectorsByStatus = Object.fromEntries(CONNECTOR_STATUSES.map((s) => [s, 0]));

    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const db = getTenantDb();
          const [intentGroups, connectorGroups] = await Promise.all([
            db.paymentIntent.groupBy({ by: ['status'], _count: { _all: true } }),
            db.connector.groupBy({ by: ['status'], where: { provider: 'MERCADO_PAGO' }, _count: { _all: true } }),
          ]);
          for (const g of intentGroups) {
            paymentIntentsByStatus[g.status] = (paymentIntentsByStatus[g.status] ?? 0) + g._count._all;
          }
          for (const g of connectorGroups) {
            connectorsByStatus[g.status] = (connectorsByStatus[g.status] ?? 0) + g._count._all;
          }
        });
      } catch (err) {
        this.logger.error(`Failed to load Mercado Pago metrics for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }

    const since = new Date(Date.now() - METRICS_WINDOW_MS);
    const [totalLast7Days, invalidSignatureLast7Days, processedPaymentEvents] = await Promise.all([
      this.prisma.webhookEvent.count({ where: { receivedAt: { gte: since } } }),
      this.prisma.webhookEvent.count({ where: { receivedAt: { gte: since }, signatureOk: false } }),
      this.prisma.webhookEvent.findMany({
        where: { receivedAt: { gte: since }, processed: true, type: 'payment' },
        select: { receivedAt: true, processedAt: true },
      }),
    ]);

    const latenciesMs = processedPaymentEvents
      .filter((e): e is typeof e & { processedAt: Date } => e.processedAt !== null)
      .map((e) => e.processedAt.getTime() - e.receivedAt.getTime());
    const avgProcessingLatencyMs =
      latenciesMs.length > 0 ? latenciesMs.reduce((a, b) => a + b, 0) / latenciesMs.length : null;

    return {
      paymentIntentsByStatus,
      connectorsByStatus,
      webhooks: {
        totalLast7Days,
        invalidSignatureLast7Days,
        invalidSignatureRate: totalLast7Days > 0 ? invalidSignatureLast7Days / totalLast7Days : 0,
        avgProcessingLatencyMs,
      },
    };
  }

  /** "eventos de conector fallidos visibles en el Backoffice" (6.3) - firma
   * inválida, o processed=false con un error registrado (huérfano,
   * importe/moneda alterados, o un fallo real que agotó los reintentos -
   * ver MercadoPagoWebhookService). Global, sin loop de tenants. */
  listFailedWebhookEvents(limit = 100): Promise<WebhookEvent[]> {
    return this.prisma.webhookEvent.findMany({
      where: { OR: [{ signatureOk: false }, { AND: [{ processed: false }, { error: { not: null } }] }] },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
