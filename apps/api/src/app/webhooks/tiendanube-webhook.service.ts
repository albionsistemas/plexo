import { randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { CompaniesService } from '@plexo/companies';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, getTenantId, Prisma, PrismaService, withTenantContext, type ConnectorProvider } from '@plexo/database';
import {
  TiendanubeApiClient,
  TiendanubeConfigService,
  TiendanubeConnector,
  verifyTiendanubeWebhookSignature,
  type TiendanubeOrderResource,
} from '@plexo/tiendanube';

const PROVIDER: ConnectorProvider = 'TIENDANUBE';

// Decisión #1 del usuario: sólo order/paid crea algo en OPLEX. Otros
// eventos que puedan llegar a este mismo endpoint algún día (order/created,
// order/cancelled, product/updated, etc.) se descartan sin dejar rastro en
// WebhookEvent - no hay nada que deduplicar para ellos todavía.
const HANDLED_EVENT = 'order/paid';

export interface TiendanubeWebhookInput {
  signatureHeader: string | undefined;
  rawBody: Buffer;
  storeId: string | undefined;
  event: string | undefined;
  orderId: string | undefined;
  payload: unknown;
}

interface TiendanubeOrderLineItemSnapshot {
  sku: string | null;
  name: string;
  quantity: number;
  unitPrice: string;
  /** null = SKU sin mapear en el catálogo de OPLEX - nunca se crea un
   * artículo automáticamente (decisión #3 del usuario). */
  articleVariantId: string | null;
}

/**
 * Composition root para la Fase 2 de PLAN_TIENDANUBE.md: convierte una
 * notificación `order/paid` de Tiendanube en una fila `TiendanubeOrder` -
 * bandeja de revisión, nunca una venta/factura real (decisión #4 del
 * usuario, ver el propio doc comment de TiendanubeOrder en schema.prisma).
 * Vive en apps/api (no en @plexo/tiendanube) por el mismo motivo que
 * MercadoPagoWebhookService: compone entre módulos (tiendanube + companies)
 * que nunca se importan entre sí directamente.
 */
@Injectable()
export class TiendanubeWebhookService {
  private readonly logger = new Logger(TiendanubeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: TiendanubeConfigService,
    private readonly connectorService: ConnectorService,
    private readonly connector: TiendanubeConnector,
    private readonly apiClient: TiendanubeApiClient,
    private readonly companiesService: CompaniesService,
  ) {}

  /**
   * Structural ordering, not incidental (mismo criterio que
   * MercadoPagoWebhookService.handleNotification): la firma se valida
   * ANTES de leer `storeId`/`event`/`orderId` para cualquier otra cosa -
   * una request con firma inválida recibe el mismo 401 exista o no ese
   * store_id.
   */
  async handleNotification(input: TiendanubeWebhookInput): Promise<void> {
    const secret = this.config.clientSecret;
    const signatureOk =
      Boolean(secret) &&
      verifyTiendanubeWebhookSignature({
        signatureHeader: input.signatureHeader,
        rawBody: input.rawBody,
        secret: secret as string,
      });

    if (!signatureOk) {
      // Mismo criterio ya documentado en MercadoPagoWebhookService: logueado
      // como su propia fila de WebhookEvent en vez de sólo devolver 401, y
      // con el mismo gap conocido de rate-limiting pendiente (ver ese
      // archivo) - no resuelto acá tampoco, mismo alcance.
      await this.prisma.webhookEvent
        .create({
          data: {
            provider: PROVIDER,
            externalId: input.orderId || randomUUID(),
            type: input.event || 'unknown',
            signatureOk: false,
            payload: (input.payload ?? {}) as Prisma.InputJsonValue,
            error: 'Invalid x-linkedstore-hmac-sha256 signature',
          },
        })
        .catch((err: unknown) => {
          this.logger.warn(`Failed to log invalid Tiendanube webhook signature attempt: ${(err as Error).message}`);
        });
      throw new UnauthorizedException('Firma de Tiendanube inválida');
    }

    if (input.event !== HANDLED_EVENT || !input.orderId) {
      return;
    }

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { provider_externalId_type: { provider: PROVIDER, externalId: input.orderId, type: input.event } },
    });
    if (existing?.processed) {
      // Misma orden notificada dos veces = un solo TiendanubeOrder.
      return;
    }

    // Resuelto ANTES de crear la fila para que quede guardado desde el
    // primer intento, no en un update separado - ver find_tenant_by_connector()
    // en la migración 20260912000000_tiendanube_orders.
    const tenantId = existing?.tenantId ?? (await this.resolveTenantId(input.storeId));

    const webhookEvent =
      existing ??
      (await this.prisma.webhookEvent.create({
        data: {
          provider: PROVIDER,
          externalId: input.orderId,
          type: input.event,
          signatureOk: true,
          tenantId: tenantId ?? undefined,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
      }));

    if (!tenantId) {
      // No reintentable por sí solo - no hay ningún Connector TIENDANUBE
      // CONNECTED para ese store_id. Ack (deja la fila con el error, no
      // silenciosamente).
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { error: `No hay un Connector de Tiendanube CONNECTED para el store_id ${input.storeId}` },
      });
      return;
    }

    try {
      await withTenantContext(this.prisma, tenantId, () =>
        this.importOrder(input.storeId as string, input.orderId as string),
      );
      await this.prisma.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true, processedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.webhookEvent.update({ where: { id: webhookEvent.id }, data: { error: message } });
      this.logger.error(`Fallo al importar la orden de Tiendanube ${input.orderId} (store ${input.storeId}): ${message}`);
      // Rethrow: el controller devuelve no-2xx y Tiendanube reintenta -
      // processed sigue en false, así que el reintento vuelve a entrar acá
      // y lo intenta de nuevo desde cero.
      throw err;
    }
  }

  /** SECURITY DEFINER, corre pre-tenant-context - mismo mecanismo que
   * find_tenant_by_oauth_account() (login/OAuth). Sólo mira connectors
   * CONNECTED (ver la función SQL) - un store desconectado/revocado no
   * debe resolver a un tenant que ya no quiere procesar esto. */
  private async resolveTenantId(storeId: string | undefined): Promise<string | undefined> {
    if (!storeId) {
      return undefined;
    }
    const rows = await this.prisma.$queryRaw<{ tenant_id: string }[]>`
      SELECT tenant_id FROM find_tenant_by_connector(${PROVIDER}, ${storeId})
    `;
    return rows[0]?.tenant_id;
  }

  /**
   * Corre entero dentro de la transacción tenant-scoped que abre
   * withTenantContext arriba - toda escritura acá (tiendanubeOrder.upsert,
   * y la creación de Company si hace falta vía CompaniesService) comparte
   * esa transacción, mismo criterio ya documentado en
   * MercadoPagoWebhookService.reconcile.
   */
  private async importOrder(storeId: string, orderId: string): Promise<void> {
    const db = getTenantDb();

    const connector = await this.connectorService.getConnector(PROVIDER);
    if (!connector || connector.status !== 'CONNECTED') {
      // find_tenant_by_connector() ya filtró por status='CONNECTED' al
      // resolver el tenant - llegar acá con otro estado sería una carrera
      // rarísima (se desconectó justo entre la resolución y este punto).
      // Ack, no hay nada reintentable por sí solo.
      return;
    }

    const accessToken = await this.connector.getValidAccessToken(connector.id);
    const order = await this.apiClient.request<TiendanubeOrderResource>({
      connectorId: connector.id,
      storeId,
      accessToken,
      method: 'GET',
      path: `/orders/${orderId}`,
    });

    const customerId = await this.resolveCustomer(order);
    const { lineItems, reviewReason } = await this.mapLineItems(order);

    const tenantId = getTenantId();
    await db.tiendanubeOrder.upsert({
      // Idempotencia propia además de la de WebhookEvent (decisión ya
      // acordada) - un upsert, no un create, para que un eventual segundo
      // paso por acá (una carrera, no el camino normal) no reviente con
      // una violación de unique constraint tratada como error.
      where: { tenantId_tiendanubeOrderId: { tenantId, tiendanubeOrderId: String(order.id) } },
      create: {
        tenantId,
        tiendanubeStoreId: storeId,
        tiendanubeOrderId: String(order.id),
        tiendanubeOrderNumber: order.number,
        reviewReason,
        customerId,
        contactName: order.contact_name,
        contactEmail: order.contact_email,
        contactIdentification: order.contact_identification,
        currency: order.currency,
        total: new Prisma.Decimal(order.total),
        lineItems: lineItems as unknown as Prisma.InputJsonValue,
        rawPayload: order as unknown as Prisma.InputJsonValue,
      },
      update: {},
    });
  }

  /**
   * Decisión #2 del usuario: CUIT/taxId primero, email segundo, se crea de
   * cero si ninguno matchea - nunca falla por falta de CUIT (consumidor
   * final, el caso común en e-commerce). `contact_identification`/
   * `contact_email` son los campos de la orden en sí (siempre presentes,
   * sin requerir el scope read_customers), no el objeto `customer`
   * anidado.
   */
  private async resolveCustomer(order: TiendanubeOrderResource): Promise<string> {
    const db = getTenantDb();
    const taxId = order.contact_identification?.replace(/\D/g, '') || undefined;

    if (taxId) {
      const byTaxId = await db.company.findFirst({ where: { taxId } });
      if (byTaxId) {
        return byTaxId.id;
      }
    }

    if (order.contact_email) {
      const byEmail = await db.company.findFirst({
        where: { email: { equals: order.contact_email, mode: 'insensitive' } },
      });
      if (byEmail) {
        return byEmail.id;
      }
    }

    // Reutilizado tal cual desde el webhook (recon ya aprobado): no exige
    // usuario logueado, sólo valida cupo de clientes del plan si el rol es
    // CUSTOMER - un plan agotado hace que esto tire y la orden quede sin
    // procesar (WebhookEvent.processed=false, Tiendanube reintenta), igual
    // que cualquier otro fallo real de este método.
    const created = await this.companiesService.createCompany({
      name: order.contact_name || 'Consumidor Final (Tiendanube)',
      taxId,
      email: order.contact_email ?? undefined,
      roles: ['CUSTOMER'],
    });
    return created.id;
  }

  /**
   * Decisión #3 del usuario: SKU desconocido queda marcado en
   * `reviewReason`, nunca se crea un artículo automático. Secuencial
   * (nunca Promise.all) - getTenantDb() es una única conexión Postgres
   * (transacción interactiva), no soporta queries concurrentes contra el
   * mismo cliente (mismo gotcha ya documentado en CompaniesService.getCompany).
   */
  private async mapLineItems(
    order: TiendanubeOrderResource,
  ): Promise<{ lineItems: TiendanubeOrderLineItemSnapshot[]; reviewReason: string | undefined }> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const unmappedSkus: string[] = [];
    let linesWithoutSku = 0;

    const lineItems: TiendanubeOrderLineItemSnapshot[] = [];
    for (const product of order.products) {
      let articleVariantId: string | null = null;
      if (product.sku) {
        const variant = await db.articleVariant.findUnique({
          where: { tenantId_sku: { tenantId, sku: product.sku } },
        });
        if (variant) {
          articleVariantId = variant.id;
        } else {
          unmappedSkus.push(product.sku);
        }
      } else {
        linesWithoutSku++;
      }
      lineItems.push({
        sku: product.sku,
        name: product.name,
        quantity: product.quantity,
        unitPrice: product.price,
        articleVariantId,
      });
    }

    const reasons: string[] = [];
    if (unmappedSkus.length > 0) {
      reasons.push(`SKU sin mapear: ${unmappedSkus.join(', ')}`);
    }
    if (linesWithoutSku > 0) {
      reasons.push(`${linesWithoutSku} línea(s) sin SKU cargado`);
    }

    return { lineItems, reviewReason: reasons.length > 0 ? reasons.join(' — ') : undefined };
  }
}
