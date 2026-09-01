import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConnectorService } from '@plexo/connectors';
import { getTenantDb, getTenantId, PrismaService, withTenantContext } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import {
  TiendanubeApiClient,
  TiendanubeConfigService,
  TiendanubeConnector,
  type TiendanubeImageResource,
  type TiendanubeLocalizedText,
  type TiendanubeProductCreateInput,
  type TiendanubeProductResource,
  type TiendanubeProductVariantInput,
} from '@plexo/tiendanube';
import { CATALOG_CHANGED, type CatalogChangedEvent } from '../dashboard/events.js';

const DEBOUNCE_MS = 5_000;

interface VariantRow {
  id: string;
  sku: string;
  unitPrice: { toNumber(): number };
  color: string | null;
  size: string | null;
  brand: string | null;
  attributes: unknown;
  tiendanubeMapping: {
    id: string;
    tiendanubeProductId: string;
    tiendanubeVariantId: string;
    tiendanubeImageId: string | null;
    lastPushedImageUrl: string | null;
  } | null;
}

/** `variant.attributes` (free-form JSON) if set, else whatever of
 * color/size/brand is non-null, labeled the way OPLEX's UI already labels
 * them. Null = this variant has no distinguishing dimension at all (the
 * "virtual variant" case - a product with no attributes). */
function resolveDimensions(variant: VariantRow): Record<string, string> | null {
  const attrs = variant.attributes as Record<string, string> | null;
  if (attrs && Object.keys(attrs).length > 0) {
    return attrs;
  }
  const fallback: Record<string, string> = {};
  if (variant.color) fallback['Color'] = variant.color;
  if (variant.size) fallback['Talle'] = variant.size;
  if (variant.brand) fallback['Marca'] = variant.brand;
  return Object.keys(fallback).length > 0 ? fallback : null;
}

/**
 * Composition root para la Fase 4 de PLAN_TIENDANUBE.md (catálogo y precios
 * OPLEX -> Tiendanube). Vive en `apps/api`, mismo motivo que
 * TiendanubeStockSyncService: scope:tiendanube no puede depender de
 * scope:inventory.
 *
 * Reparto de responsabilidades con la Fase 3 (ya construida): esta clase
 * NUNCA toca `stock` salvo el valor inicial al crear un producto/variante
 * por primera vez - de ahí en más, TiendanubeStockSyncService es el único
 * dueño de ese campo. Evita que dos servicios independientes empujen el
 * mismo número por caminos distintos.
 */
@Injectable()
export class TiendanubeCatalogSyncService {
  private readonly logger = new Logger(TiendanubeCatalogSyncService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly connectorService: ConnectorService,
    private readonly tiendanubeConnector: TiendanubeConnector,
    private readonly apiClient: TiendanubeApiClient,
    private readonly inventoryService: InventoryService,
    private readonly config: TiendanubeConfigService,
  ) {}

  @OnEvent(CATALOG_CHANGED)
  onCatalogChanged(event: CatalogChangedEvent): void {
    const key = `${event.tenantId}:${event.articleId}`;
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      this.timers.delete(key);
      withTenantContext(this.prisma, event.tenantId, () => this.syncArticle(event.articleId)).catch((err) => {
        this.logger.warn(`No se pudo sincronizar el catálogo del artículo ${event.articleId} (tenant ${event.tenantId}) con Tiendanube: ${err}`);
      });
    }, DEBOUNCE_MS);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  /**
   * Sincroniza TODOS los artículos publicados del tenant activo - pensado
   * para la primera conexión (backfill) o para "sincronizar catálogo
   * ahora" a pedido. Asume que YA hay contexto de tenant activo (corre
   * dentro de un request autenticado normal, a diferencia de `syncArticle`
   * llamado desde el debounce, que abre su propio `withTenantContext`).
   * Secuencial a propósito: `TiendanubeApiClient` ya serializa/pacea cada
   * llamada por `connectorId`, un loop secuencial alcanza para respetar el
   * rate limit sin plomería nueva - más lento para cientos de artículos,
   * pero la barra de progreso en UI es explícitamente Fase 5, no esta.
   */
  async syncAllPublished(): Promise<{ total: number; synced: number; skipped: number }> {
    const articles = await getTenantDb().article.findMany({ where: { isPublished: true }, select: { id: true } });
    let synced = 0;
    let skipped = 0;
    for (const { id } of articles) {
      const ok = await this.syncArticle(id);
      if (ok) {
        synced++;
      } else {
        skipped++;
      }
    }
    return { total: articles.length, synced, skipped };
  }

  /** Devuelve false cuando el artículo se salteó (no publicado, sin
   * variantes, sin connector conectado, o atributos inconsistentes entre
   * variantes) - nunca tira por esos casos, sólo por un fallo real de red/
   * API tras agotar los reintentos de TiendanubeApiClient. */
  async syncArticle(articleId: string): Promise<boolean> {
    const tenantId = getTenantId();
    const db = getTenantDb();

    const article = await db.article.findUnique({
      where: { id: articleId },
      include: { variants: { include: { tiendanubeMapping: true } } },
    });
    if (!article || !article.isPublished || article.variants.length === 0) {
      return false;
    }

    const connector = await this.connectorService.getConnector('TIENDANUBE');
    if (!connector || connector.status !== 'CONNECTED' || !connector.externalAccountId) {
      return false;
    }
    const storeId = connector.externalAccountId;

    const variants = article.variants as VariantRow[];
    const dimensionsByVariant = new Map<string, Record<string, string> | null>();
    for (const variant of variants) {
      dimensionsByVariant.set(variant.id, resolveDimensions(variant));
    }

    const keySets = variants.map((v) => {
      const dims = dimensionsByVariant.get(v.id);
      return dims ? Object.keys(dims).sort().join('|') : '';
    });
    const uniqueKeySets = new Set(keySets);
    if (uniqueKeySets.size > 1) {
      this.logger.warn(
        `Artículo "${article.name}" (${articleId}, tenant ${tenantId}) tiene variantes con atributos inconsistentes entre sí - Tiendanube exige el mismo conjunto de atributos para todas las variantes de un producto. No sincronizado.`,
      );
      return false;
    }
    if (variants.length > 1 && keySets[0] === '') {
      this.logger.warn(
        `Artículo "${article.name}" (${articleId}, tenant ${tenantId}) tiene ${variants.length} variantes sin ningún atributo que las distinga - Tiendanube no puede representarlas bajo un mismo producto. No sincronizado.`,
      );
      return false;
    }
    const canonicalAttributes = keySets[0] ? keySets[0].split('|') : [];

    const accessToken = await this.tiendanubeConnector.getValidAccessToken(connector.id);
    const name: TiendanubeLocalizedText = { es: article.name };
    const description: TiendanubeLocalizedText | undefined = article.description ? { es: article.description } : undefined;
    const attributes: TiendanubeLocalizedText[] | undefined =
      canonicalAttributes.length > 0 ? canonicalAttributes.map((key) => ({ es: key })) : undefined;

    const valuesFor = (variantId: string): TiendanubeLocalizedText[] | undefined => {
      if (canonicalAttributes.length === 0) {
        return undefined;
      }
      const dims = dimensionsByVariant.get(variantId) ?? {};
      return canonicalAttributes.map((key) => ({ es: dims[key] ?? '' }));
    };

    const existingMapping = variants.find((v) => v.tiendanubeMapping)?.tiendanubeMapping;
    let productId: string;

    if (!existingMapping) {
      const variantInputs: TiendanubeProductVariantInput[] = [];
      for (const variant of variants) {
        const stock = await this.inventoryService.getConsolidatedStock(variant.id);
        variantInputs.push({
          sku: variant.sku,
          price: variant.unitPrice.toNumber().toFixed(2),
          values: valuesFor(variant.id),
          stock_management: true,
          stock: Math.max(0, Math.floor(stock.toNumber())),
        });
      }
      const body: TiendanubeProductCreateInput = { name, description, attributes, variants: variantInputs };
      const created = await this.apiClient.request<TiendanubeProductResource>({
        connectorId: connector.id,
        storeId,
        accessToken,
        method: 'POST',
        path: '/products',
        body,
      });
      productId = String(created.id);

      for (const variant of variants) {
        const matched = created.variants.find((v) => v.sku === variant.sku);
        if (!matched) {
          this.logger.warn(
            `Tiendanube no devolvió ninguna variante con el SKU "${variant.sku}" al crear el producto del artículo ${articleId} (tenant ${tenantId})`,
          );
          continue;
        }
        await db.tiendanubeProductMapping.create({
          data: {
            tenantId,
            articleVariantId: variant.id,
            tiendanubeProductId: productId,
            tiendanubeVariantId: String(matched.id),
            lastPushedStock: matched.stock ?? 0,
            lastPushedAt: new Date(),
          },
        });
      }
    } else {
      productId = existingMapping.tiendanubeProductId;
      await this.apiClient.request({
        connectorId: connector.id,
        storeId,
        accessToken,
        method: 'PUT',
        path: `/products/${productId}`,
        body: { name, description, attributes },
      });

      for (const variant of variants) {
        if (variant.tiendanubeMapping) {
          await this.apiClient.request({
            connectorId: connector.id,
            storeId,
            accessToken,
            method: 'PUT',
            path: `/products/${productId}/variants/${variant.tiendanubeMapping.tiendanubeVariantId}`,
            body: { sku: variant.sku, price: variant.unitPrice.toNumber().toFixed(2), values: valuesFor(variant.id) },
          });
        } else {
          // Variante nueva agregada a un artículo ya sincronizado antes -
          // sólo acá corresponde mandar stock inicial (mismo criterio que
          // la creación del producto), nunca en el PUT de arriba.
          const stock = await this.inventoryService.getConsolidatedStock(variant.id);
          const createdVariant = await this.apiClient.request<{ id: number }>({
            connectorId: connector.id,
            storeId,
            accessToken,
            method: 'POST',
            path: `/products/${productId}/variants`,
            body: {
              sku: variant.sku,
              price: variant.unitPrice.toNumber().toFixed(2),
              values: valuesFor(variant.id),
              stock_management: true,
              stock: Math.max(0, Math.floor(stock.toNumber())),
            },
          });
          await db.tiendanubeProductMapping.create({
            data: {
              tenantId,
              articleVariantId: variant.id,
              tiendanubeProductId: productId,
              tiendanubeVariantId: String(createdVariant.id),
              lastPushedStock: Math.max(0, Math.floor(stock.toNumber())),
              lastPushedAt: new Date(),
            },
          });
        }
      }
    }

    await this.syncImage(article, variants, productId, connector.id, storeId, accessToken);
    return true;
  }

  /**
   * La imagen es un atributo a nivel Article, pero el mapeo es por
   * ArticleVariant (ver comentario en el schema) - se lee/escribe desde
   * cualquiera de las filas de este artículo, y se propaga a todas para que
   * queden consistentes entre sí. Tiendanube no tiene "reemplazar el src de
   * una imagen existente": cambiar la imagen es borrar la vieja (si había)
   * y subir la nueva.
   */
  private async syncImage(
    article: { id: string; imageUrl: string | null },
    variants: VariantRow[],
    productId: string,
    connectorId: string,
    storeId: string,
    accessToken: string,
  ): Promise<void> {
    const db = getTenantDb();
    const mappings = await db.tiendanubeProductMapping.findMany({
      where: { articleVariantId: { in: variants.map((v) => v.id) } },
    });
    const tracked = mappings.find((m) => m.tiendanubeImageId != null) ?? mappings[0];
    const currentImageId = tracked?.tiendanubeImageId ?? null;
    const lastPushedImageUrl = tracked?.lastPushedImageUrl ?? null;

    if (article.imageUrl === lastPushedImageUrl) {
      return;
    }

    if (currentImageId) {
      try {
        await this.apiClient.request({
          connectorId,
          storeId,
          accessToken,
          method: 'DELETE',
          path: `/products/${productId}/images/${currentImageId}`,
        });
      } catch (err) {
        this.logger.warn(`No se pudo borrar la imagen anterior (${currentImageId}) del producto ${productId} en Tiendanube: ${err}`);
      }
    }

    let newImageId: string | null = null;
    if (article.imageUrl) {
      const base = this.config.publicBaseUrl;
      if (!base) {
        this.logger.warn(
          `No se pudo publicar la imagen del artículo ${article.id} en Tiendanube: falta OAUTH_CALLBACK_BASE_URL en este servidor (esta máquina no es públicamente alcanzable)`,
        );
        return;
      }
      try {
        const image = await this.apiClient.request<TiendanubeImageResource>({
          connectorId,
          storeId,
          accessToken,
          method: 'POST',
          path: `/products/${productId}/images`,
          body: { src: `${base}${article.imageUrl}` },
        });
        newImageId = String(image.id);
      } catch (err) {
        this.logger.warn(`No se pudo subir la imagen del artículo ${article.id} a Tiendanube: ${err}`);
        return;
      }
    }

    await db.tiendanubeProductMapping.updateMany({
      where: { articleVariantId: { in: variants.map((v) => v.id) } },
      data: { tiendanubeImageId: newImageId, lastPushedImageUrl: article.imageUrl },
    });
  }
}
