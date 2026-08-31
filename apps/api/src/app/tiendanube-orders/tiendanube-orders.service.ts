import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, type TiendanubeOrder } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';
import type { TiendanubeOrderLineItemSnapshot } from '../webhooks/tiendanube-webhook.service.js';
import { SalesService } from '../sales/sales.service.js';
import type { ConvertTiendanubeOrderDto } from './dto/convert-tiendanube-order.dto.js';

/**
 * Composition root para el "clic humano" de la decisión #4: convierte un
 * TiendanubeOrder ya PENDING_REVIEW en una venta real. Vive en apps/api
 * (no en @plexo/tiendanube) por el mismo motivo que TiendanubeWebhookService
 * y SalesService: compone entre módulos (database + sales + inventory) que
 * nunca se importan entre sí directamente. Nunca vuelve a leer la API de
 * Tiendanube - todo lo que necesita ya está en el snapshot que
 * TiendanubeWebhookService guardó al recibir el webhook (precio incluido:
 * lineItems[].unitPrice es el precio histórico cobrado en la tienda, no el
 * de catálogo actual).
 */
@Injectable()
export class TiendanubeOrdersService {
  constructor(
    private readonly salesService: SalesService,
    private readonly inventoryService: InventoryService,
  ) {}

  /** Bandeja mínima (Fase 2 cont., pieza 3) - todas las órdenes del
   * tenant, más recientes primero. El filtrado/agrupado por estado queda
   * del lado del frontend; el panel completo (progreso de sync, catálogo,
   * stock) es Fase 5, sin construir. */
  list() {
    return getTenantDb().tiendanubeOrder.findMany({
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Atómico + idempotente - diseño acordado con el usuario antes de
   * escribir esto:
   *
   * 1. Esta ruta corre bajo TenantContextInterceptor, que ya abre UNA
   *    transacción por request (misma garantía que SalesService.createSale
   *    ya documenta) - si algo tira desde el `updateMany` de abajo en
   *    adelante, TODA la transacción hace rollback, el `updateMany`
   *    incluido: la orden vuelve a PENDING_REVIEW sola, nunca queda
   *    CONVERTED sin venta detrás.
   * 2. El único riesgo real es la carrera entre dos clics concurrentes, no
   *    un fallo a mitad de camino - por eso el check de estado es un
   *    compare-and-swap real (`updateMany` con `WHERE status =
   *    PENDING_REVIEW`), ANTES de crear nada. Un segundo request
   *    concurrente que llegue acá bloquea en el lock de fila de Postgres
   *    hasta que este commitee o haga rollback; si commiteó, el propio
   *    `updateMany` de esa otra request matchea 0 filas y nunca llega a
   *    crear una segunda venta. Reclamar DESPUÉS de crear la venta sería
   *    la carrera clásica: dos requests concurrentes podrían crear dos
   *    ventas reales antes de que cualquiera reclame.
   * 3. Los dos caminos de no-op (ya CONVERTED al leer, o perdida la
   *    carrera del `updateMany`) devuelven la fila completa en el MISMO
   *    shape que el camino de éxito (un `TiendanubeOrder` sin `select`
   *    parcial en ningún lado) - la UI recibe una respuesta consistente
   *    gane quien gane.
   */
  async convert(id: string, dto: ConvertTiendanubeOrderDto): Promise<TiendanubeOrder> {
    const db = getTenantDb();
    const order = await db.tiendanubeOrder.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException('Orden de Tiendanube no encontrada');
    }
    if (order.status === 'CONVERTED') {
      return order; // no-op idempotente - reintento secuencial de un clic ya exitoso.
    }

    const lineItems = order.lineItems as unknown as TiendanubeOrderLineItemSnapshot[];
    this.assertConvertible(lineItems);
    this.assertModeInputs(dto);

    const claim = await db.tiendanubeOrder.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: 'CONVERTED', convertedAt: new Date() },
    });
    if (claim.count === 0) {
      // Perdió la carrera contra un request concurrente que ya convirtió
      // esta misma orden - no crea una segunda venta, sólo devuelve el
      // estado actual (ya CONVERTED, con su propio convertedInvoiceId).
      return (await db.tiendanubeOrder.findUnique({ where: { id } })) as TiendanubeOrder;
    }

    const convertedInvoiceId =
      dto.mode === 'INVOICE'
        ? (await this.createInvoiceSale(order, lineItems, dto)).id
        : await this.createStockOnlySale(order, lineItems, dto.warehouseId);

    return db.tiendanubeOrder.update({ where: { id }, data: { convertedInvoiceId } });
  }

  /** Ningún SKU sin mapear puede convertirse - decisión #3, nunca se creó
   * un ArticleVariant automático para esas líneas, así que no hay stock
   * real que mover ni catálogo real que facturar. */
  private assertConvertible(lineItems: TiendanubeOrderLineItemSnapshot[]): void {
    const unmapped = lineItems.filter((line) => !line.articleVariantId);
    if (unmapped.length > 0) {
      throw new BadRequestException(
        `No se puede convertir: ${unmapped.length} línea(s) sin SKU mapeado (${unmapped
          .map((line) => line.sku ?? '(sin SKU)')
          .join(', ')})`,
      );
    }
  }

  /** Defensa en profundidad además del @ValidateIf del DTO - si algún
   * día algo llama a este service sin pasar por el ValidationPipe del
   * controller, un modo INVOICE sin branchId/documentLetter no debe
   * llegar a crear nada a medias. */
  private assertModeInputs(dto: ConvertTiendanubeOrderDto): void {
    if (dto.mode === 'INVOICE' && (!dto.branchId || !dto.documentLetter)) {
      throw new BadRequestException('El modo INVOICE requiere branchId y documentLetter');
    }
  }

  /** Precios "IVA incluido" siempre true acá - las tiendas online en
   * Argentina muestran precio final al comprador, nunca neto (decisión
   * mostrada y acordada con el usuario, no una suposición silenciosa). El
   * `unitPrice` de cada línea es el snapshot histórico del webhook
   * (lo que se cobró realmente en Tiendanube), nunca el precio de catálogo
   * actual de OPLEX. */
  private async createInvoiceSale(
    order: TiendanubeOrder,
    lineItems: TiendanubeOrderLineItemSnapshot[],
    dto: ConvertTiendanubeOrderDto,
  ) {
    const currency = await getTenantDb().currency.findFirst({ where: { code: order.currency } });
    if (!currency) {
      throw new BadRequestException(`No hay una moneda configurada con código "${order.currency}" en este tenant`);
    }

    return this.salesService.createSale({
      customerId: order.customerId,
      warehouseId: dto.warehouseId,
      documentLetter: dto.documentLetter as NonNullable<ConvertTiendanubeOrderDto['documentLetter']>,
      branchId: dto.branchId as string,
      currencyId: currency.id,
      pricesIncludeTax: true,
      lines: lineItems.map((line) => ({
        articleVariantId: line.articleVariantId as string,
        quantity: line.quantity,
        unitPrice: Number(line.unitPrice),
      })),
    });
  }

  /**
   * "Crear venta sin facturar" (decisión #1 respetada: no asumir CAE) -
   * mapea a la "venta informal" ya documentada en PROGRESS.md: un
   * SALE_OUT por línea, sin Invoice, sin asiento contable automático
   * (InventoryService sólo conoce cantidades, no hay con qué generar un
   * asiento correcto ahí - mismo hueco ya aceptado, no resuelto acá
   * tampoco). `sourceType`/`sourceId` son texto libre en StockMovement
   * (no un enum), reutilizado para trazar qué generó cada movimiento -
   * mismo campo que SalesService ya usa con 'INVOICE'/'CREDIT_NOTE'.
   */
  private async createStockOnlySale(
    order: TiendanubeOrder,
    lineItems: TiendanubeOrderLineItemSnapshot[],
    warehouseId: string,
  ): Promise<undefined> {
    for (const line of lineItems) {
      await this.inventoryService.recordMovement({
        warehouseId,
        articleVariantId: line.articleVariantId as string,
        type: 'SALE_OUT',
        quantity: line.quantity,
        sourceType: 'TIENDANUBE_ORDER',
        sourceId: order.id,
      });
    }
    return undefined;
  }
}
