import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import { TiendanubeApiClient, TiendanubeAuthError, TiendanubeConnector, type TiendanubeProductResource } from '@plexo/tiendanube';
import { STOCK_UPDATED, type StockUpdatedEvent } from '../dashboard/events.js';

/** Coalesces a burst of movements against the same variant into one push -
 * "debounce/batch por artículo" pedido por la Fase 3 del plan. Arbitrario,
 * no configurable: no hay todavía un caso real que pida ajustarlo. */
const DEBOUNCE_MS = 5_000;

/**
 * Composition root para la Fase 3 de PLAN_TIENDANUBE.md (stock OPLEX ->
 * Tiendanube, OPLEX como única fuente de verdad - decisión ya tomada con el
 * usuario en el reconocimiento de la integración). Vive en `apps/api`, no en
 * `libs/modules/tiendanube` (scope:tiendanube no puede depender de
 * scope:inventory, ver eslint.config.mjs), mismo criterio ya usado por
 * TiendanubeWebhookService/TiendanubeOrdersService.
 *
 * Deliberadamente NO escucha ningún webhook `product/updated` de Tiendanube
 * - el plan marca eso como el camino más simple para evitar el bucle de eco
 * (OPLEX empuja -> Tiendanube notifica el cambio -> OPLEX lo vuelve a
 * empujar...), y hasta que un caso real lo pida no hace falta sumarlo. El
 * único camino Tiendanube -> OPLEX sigue siendo el de la Fase 2 (la orden
 * paga descuenta stock una vez, vía TiendanubeOrdersService.convert).
 */
@Injectable()
export class TiendanubeStockSyncService {
  private readonly logger = new Logger(TiendanubeStockSyncService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorService: ConnectorService,
    private readonly tiendanubeConnector: TiendanubeConnector,
    private readonly apiClient: TiendanubeApiClient,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Sync on purpose: sólo agenda/reinicia el timer de debounce, nunca hace
   * I/O acá - el trabajo real (que necesita su propio `withTenantContext`,
   * ver `push`) corre bien después de que este handler y el request HTTP
   * que disparó el evento ya terminaron.
   */
  @OnEvent(STOCK_UPDATED)
  onStockUpdated(event: StockUpdatedEvent): void {
    const key = `${event.tenantId}:${event.articleVariantId}`;
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.push(event.tenantId, event.articleVariantId).catch(async (err) => {
        this.logger.warn(
          `No se pudo sincronizar el stock del variant ${event.articleVariantId} (tenant ${event.tenantId}) con Tiendanube: ${err}`,
        );
        // Fase 6 (hardening): "manejo de desinstalación... o 401
        // sistemático → REVOKED" - un 401/403 acá significa que Tiendanube
        // invalidó el token sin que llegara (o sin esperar) el webhook
        // app/uninstalled. La transacción de `push` ya hizo rollback solo
        // (TiendanubeAuthError la interrumpió), así que revocar necesita su
        // propia transacción nueva, no puede reusar esa.
        if (err instanceof TiendanubeAuthError) {
          await withTenantContext(this.prisma, event.tenantId, () => this.revokeOnAuthError()).catch((revokeErr) => {
            this.logger.warn(`No se pudo marcar REVOKED el connector de Tiendanube (tenant ${event.tenantId}): ${revokeErr}`);
          });
        }
      });
    }, DEBOUNCE_MS);
    // No debe mantener vivo el proceso sólo por este timer pendiente -
    // mismo criterio que cualquier otro timer de background best-effort.
    timer.unref?.();
    this.timers.set(key, timer);
  }

  private async push(tenantId: string, articleVariantId: string): Promise<void> {
    await withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();

      const variant = await db.articleVariant.findUnique({
        where: { id: articleVariantId },
        select: { sku: true, article: { select: { isPublished: true } } },
      });
      // Borrada desde que se agendó el debounce, o el artículo dejó de
      // estar publicado mientras tanto - nada que sincronizar.
      if (!variant || !variant.article.isPublished) {
        return;
      }

      const connector = await this.connectorService.getConnector('TIENDANUBE');
      if (!connector || connector.status !== 'CONNECTED' || !connector.externalAccountId) {
        return;
      }
      const storeId = connector.externalAccountId;

      const consolidated = await this.inventoryService.getConsolidatedStock(articleVariantId);
      // El `stock` de Tiendanube es un entero simple - OPLEX admite
      // cantidades fraccionarias (Decimal(14,3), artículos por peso).
      // Redondea siempre hacia abajo: informar de menos nunca sobrevende,
      // informar de más sí puede.
      const stockToPush = Math.max(0, Math.floor(consolidated.toNumber()));

      let mapping = await db.tiendanubeProductMapping.findUnique({ where: { articleVariantId } });

      if (mapping?.lastPushedStock != null && mapping.lastPushedStock.toNumber() === stockToPush) {
        // Tiendanube ya tiene este valor - no gastar otra llamada del rate
        // limit por algo que la tienda ya sabe.
        return;
      }

      const accessToken = await this.tiendanubeConnector.getValidAccessToken(connector.id);

      if (!mapping) {
        if (!variant.sku) {
          return;
        }
        mapping = await this.resolveMapping(tenantId, articleVariantId, variant.sku, connector.id, storeId, accessToken);
        if (!mapping) {
          return;
        }
      }

      await this.apiClient.request({
        connectorId: connector.id,
        storeId,
        accessToken,
        method: 'PUT',
        path: `/products/${mapping.tiendanubeProductId}/variants/${mapping.tiendanubeVariantId}`,
        body: { stock: stockToPush },
      });

      await db.tiendanubeProductMapping.update({
        where: { id: mapping.id },
        data: { lastPushedStock: stockToPush, lastPushedAt: new Date() },
      });
    });
  }

  /**
   * Resuelve producto/variante de Tiendanube por SKU (GET /products/sku/
   * :sku, confirmado contra la doc oficial: devuelve el primer producto que
   * tenga una variante con ese SKU) y persiste el mapeo para no volver a
   * buscarlo. Devuelve null (nunca tira) cuando el SKU todavía no existe
   * como producto en la tienda - caso esperado hasta que exista la Fase 4
   * (creación de catálogo), no un error a reintentar agresivamente: el
   * próximo movimiento de stock de esta variante dispara un reintento solo.
   */
  private async resolveMapping(
    tenantId: string,
    articleVariantId: string,
    sku: string,
    connectorId: string,
    storeId: string,
    accessToken: string,
  ) {
    let product: TiendanubeProductResource;
    try {
      product = await this.apiClient.request<TiendanubeProductResource>({
        connectorId,
        storeId,
        accessToken,
        method: 'GET',
        path: `/products/sku/${encodeURIComponent(sku)}`,
      });
    } catch (err) {
      if (err instanceof TiendanubeAuthError) {
        // No es "SKU no encontrado" - re-lanzar para que el catch de
        // onStockUpdated lo detecte y marque el connector REVOKED.
        throw err;
      }
      this.logger.warn(
        `SKU "${sku}" no encontrado en la tienda de Tiendanube (tenant ${tenantId}) - no se pudo sincronizar el stock: ${err}`,
      );
      return null;
    }

    const matchedVariant = product.variants.find((v) => v.sku === sku);
    if (!matchedVariant) {
      this.logger.warn(
        `El producto de Tiendanube devuelto para el SKU "${sku}" no tiene ninguna variante con ese SKU (tenant ${tenantId})`,
      );
      return null;
    }

    return getTenantDb().tiendanubeProductMapping.create({
      data: {
        tenantId,
        articleVariantId,
        tiendanubeProductId: String(product.id),
        tiendanubeVariantId: String(matchedVariant.id),
      },
    });
  }

  /** Mismo criterio que TiendanubeWebhookService.revokeConnector
   * (app/uninstalled) - acá el disparador es un 401/403 real detectado en
   * uso, no un webhook. No-op sobre un connector ya REVOKED/DISCONNECTED o
   * inexistente (idempotente ante varios 401 seguidos). */
  private async revokeOnAuthError(): Promise<void> {
    const connector = await this.connectorService.getConnector('TIENDANUBE');
    if (!connector || connector.status === 'REVOKED' || connector.status === 'DISCONNECTED') {
      return;
    }
    await this.connectorService.clearSecrets(connector.id);
    await this.connectorService.setStatus(
      connector.id,
      'REVOKED',
      'Tiendanube devolvió 401/403 al sincronizar stock - posible revocación no notificada por webhook',
    );
  }
}
