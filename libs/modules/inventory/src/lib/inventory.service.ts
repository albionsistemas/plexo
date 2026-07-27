import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  type Article,
  type Category,
  type MinimumStock,
  type Warehouse,
} from '@plexo/database';
import type { CreateArticleDto } from './dto/create-article.dto.js';
import type { UpdateArticleDto } from './dto/update-article.dto.js';
import type { CreateArticleVariantDto } from './dto/create-article-variant.dto.js';
import type { CreateCategoryDto } from './dto/create-category.dto.js';
import type { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import type { RecordStockMovementDto } from './dto/record-stock-movement.dto.js';
import type { SetMinimumStockDto } from './dto/set-minimum-stock.dto.js';
import { computeStockDelta } from './stock-movement.domain.js';

export interface ReorderSuggestion {
  warehouseId: string;
  articleVariantId: string;
  minimumQuantity: Prisma.Decimal;
  currentQuantity: Prisma.Decimal;
}

export interface WarehouseStockRow {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

export interface ArticleVariantListItem {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  unitPrice: number;
  totalStock: number;
  // Sum of MinimumStock.minimumQuantity across warehouses for this variant
  // (minimums are set per warehouse, same as stock itself) - null if none
  // configured anywhere, same convention as totalStock aggregating actual
  // stock across warehouses.
  minimumStock: number | null;
  stockByWarehouse: WarehouseStockRow[];
}

export interface ArticleListItem {
  id: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  isService: boolean;
  isPublished: boolean;
  imageUrl: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  variants: ArticleVariantListItem[];
}

@Injectable()
export class InventoryService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  createWarehouse(dto: CreateWarehouseDto): Promise<Warehouse> {
    return getTenantDb().warehouse.create({
      data: { tenantId: getTenantId(), name: dto.name, location: dto.location },
    });
  }

  listWarehouses(): Promise<Warehouse[]> {
    return getTenantDb().warehouse.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(dto: CreateCategoryDto): Promise<Category> {
    return getTenantDb().category.create({
      data: { tenantId: getTenantId(), name: dto.name, parentId: dto.parentId },
    });
  }

  listCategories(): Promise<Category[]> {
    return getTenantDb().category.findMany({ orderBy: { name: 'asc' } });
  }

  createArticle(dto: CreateArticleDto): Promise<Article> {
    return getTenantDb().article.create({
      data: {
        tenantId: getTenantId(),
        name: dto.name,
        description: dto.description,
        unitOfMeasure: dto.unitOfMeasure,
        categoryId: dto.categoryId,
        taxDefinitionId: dto.taxDefinitionId,
        isService: dto.isService,
        isPublished: dto.isPublished,
      },
    });
  }

  async updateArticle(id: string, dto: UpdateArticleDto): Promise<Article> {
    const db = getTenantDb();
    // undefined (field omitted) leaves preferredSupplierId untouched;
    // explicit null clears it; a real id must resolve to an active
    // SUPPLIER company - same validation QuoteRequestService/
    // PurchaseOrderService apply when a document picks a supplier.
    if (dto.preferredSupplierId) {
      const supplier = await db.company.findUnique({
        where: { id: dto.preferredSupplierId },
        include: { roles: true },
      });
      if (!supplier) {
        throw new BadRequestException('Supplier not found');
      }
      if (!supplier.active) {
        throw new BadRequestException('This supplier is inactive');
      }
      if (!supplier.roles.some((r) => r.role === 'SUPPLIER')) {
        throw new BadRequestException('This company is not flagged as a supplier');
      }
    }

    return db.article.update({
      where: { id },
      data: {
        isService: dto.isService,
        isPublished: dto.isPublished,
        preferredSupplierId: dto.preferredSupplierId,
      },
    });
  }

  async listArticles(): Promise<ArticleListItem[]> {
    const articles = await getTenantDb().article.findMany({
      include: {
        category: true,
        preferredSupplier: { select: { id: true, name: true } },
        variants: { include: { stockLedger: { include: { warehouse: true } }, minimumStocks: true } },
      },
      orderBy: { name: 'asc' },
    });

    return articles.map((article) => ({
      id: article.id,
      name: article.name,
      description: article.description,
      unitOfMeasure: article.unitOfMeasure,
      categoryId: article.categoryId,
      categoryName: article.category?.name ?? null,
      isService: article.isService,
      isPublished: article.isPublished,
      imageUrl: article.imageUrl,
      preferredSupplierId: article.preferredSupplierId,
      preferredSupplierName: article.preferredSupplier?.name ?? null,
      variants: article.variants.map((variant) => {
        const stockByWarehouse: WarehouseStockRow[] = variant.stockLedger.map((sl) => ({
          warehouseId: sl.warehouseId,
          warehouseName: sl.warehouse.name,
          quantity: sl.quantity.toNumber(),
        }));
        return {
          id: variant.id,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          brand: variant.brand,
          unitPrice: variant.unitPrice.toNumber(),
          totalStock: stockByWarehouse.reduce((sum, row) => sum + row.quantity, 0),
          minimumStock:
            variant.minimumStocks.length === 0
              ? null
              : variant.minimumStocks.reduce((sum, ms) => sum + ms.minimumQuantity.toNumber(), 0),
          stockByWarehouse,
        };
      }),
    }));
  }

  async createArticleVariant(dto: CreateArticleVariantDto) {
    const db = getTenantDb();
    const tenantId = getTenantId();

    const variant = await db.articleVariant.create({
      data: {
        tenantId,
        articleId: dto.articleId,
        sku: dto.sku,
        color: dto.color,
        size: dto.size,
        brand: dto.brand,
        unitPrice: dto.unitPrice,
      },
    });

    await db.priceHistory.create({
      data: {
        tenantId,
        articleVariantId: variant.id,
        unitPrice: dto.unitPrice,
        changedById: getUserId(),
      },
    });

    return variant;
  }

  async updateArticleVariantPrice(articleVariantId: string, unitPrice: number) {
    const db = getTenantDb();
    const tenantId = getTenantId();

    const variant = await db.articleVariant.update({
      where: { id: articleVariantId },
      data: { unitPrice },
    });

    await db.priceHistory.create({
      data: { tenantId, articleVariantId, unitPrice, changedById: getUserId() },
    });

    return variant;
  }

  setMinimumStock(dto: SetMinimumStockDto): Promise<MinimumStock> {
    return getTenantDb().minimumStock.upsert({
      where: {
        warehouseId_articleVariantId: {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
        },
      },
      create: { tenantId: getTenantId(), ...dto },
      update: { minimumQuantity: dto.minimumQuantity },
    });
  }

  /**
   * Records one stock movement and updates StockLedger atomically. Both
   * writes land in the same DB transaction that TenantContextInterceptor
   * already opened for this request (getTenantDb() returns that tx client),
   * so there's no separate $transaction() call here - nesting one wouldn't
   * even be possible against a client that's already a transaction.
   *
   * The insufficient-stock check is race-free under concurrent requests
   * because it's not a read-then-write: `updateMany` with `quantity: {gte}`
   * in its WHERE clause is a single atomic
   * `UPDATE ... WHERE quantity >= $1` - if two concurrent sales race for
   * the last units, only one UPDATE matches a row, the other gets count=0
   * and fails cleanly instead of double-decrementing past zero.
   *
   * Deliberately does NOT post anything to the ledger (accounting) itself.
   * Since the weighted-average cost feature, this module does track unit
   * cost (StockLedger.avgUnitCost, StockMovement.unitCost) - but never sale
   * price/revenue, and never posts a journal entry on its own. A SALE_OUT
   * recorded here without going through SalesService (apps/api, which
   * composes Invoicing + Inventory + Accounting, reading back
   * movement.unitCost to post COGS) has no invoiceId and no revenue side -
   * there's nothing correct to auto-post from. Any stock movement that
   * represents real revenue but didn't go through an invoice (informal
   * sale, manual adjustment standing in for one, etc.) needs its journal
   * entry posted by hand via POST /accounting/journal-entries. Revisit if
   * this turns out to be a common enough flow to deserve its own
   * quantity+price DTO and an auto-posting path like invoices get.
   */
  async recordMovement(dto: RecordStockMovementDto) {
    if (dto.type === 'ADJUSTMENT') {
      if (dto.quantity === 0) {
        throw new BadRequestException('ADJUSTMENT quantity must not be zero');
      }
    } else if (dto.quantity <= 0) {
      throw new BadRequestException(`${dto.type} quantity must be a positive number`);
    }
    if ((dto.type === 'PURCHASE_IN' || dto.type === 'PRODUCTION_IN') && dto.unitCost == null) {
      throw new BadRequestException(`${dto.type} requires unitCost`);
    }

    const db = getTenantDb();
    const tenantId = getTenantId();
    const delta = computeStockDelta(dto.type, dto.quantity);

    // Weighted-average cost (PPP) tracking: ADJUSTMENT never touches cost -
    // it's a quantity-only correction, same precedent as the informal-sale
    // note below (only SalesService-driven flows auto-post to accounting).
    // Every other type reads the current ledger row first, since both
    // branches below need it (prior average for inbound, current average
    // to stamp on outbound) and neither existing branch used to read
    // before writing.
    let priorLedger: { quantity: Prisma.Decimal; avgUnitCost: Prisma.Decimal | null } | null =
      null;
    if (dto.type !== 'ADJUSTMENT') {
      priorLedger = await db.stockLedger.findUnique({
        where: {
          warehouseId_articleVariantId: {
            warehouseId: dto.warehouseId,
            articleVariantId: dto.articleVariantId,
          },
        },
        select: { quantity: true, avgUnitCost: true },
      });
    }

    let stampedUnitCost: Prisma.Decimal | null = null;

    if (delta < 0) {
      if (dto.type === 'SALE_OUT' || dto.type === 'PRODUCTION_OUT') {
        // Outbound never changes the average - it just consumes at
        // whatever it currently is, and that's what gets stamped on the
        // movement so SalesService can compute COGS from it later.
        stampedUnitCost = priorLedger?.avgUnitCost ?? null;
      }

      const decremented = await db.stockLedger.updateMany({
        where: {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
          quantity: { gte: -delta },
        },
        data: { quantity: { increment: delta } },
      });
      if (decremented.count === 0) {
        throw new BadRequestException('Insufficient stock in this warehouse');
      }
    } else {
      let newAvgUnitCost: Prisma.Decimal | undefined;
      // RETURN carries a cost only when the caller knows it (SalesService's
      // voidSale, reversing a costed SALE_OUT) - a manually-posted RETURN
      // without one just stays quantity-only, same as before this feature.
      const isCostedInbound =
        dto.type === 'PURCHASE_IN' || dto.type === 'PRODUCTION_IN' || dto.type === 'RETURN';
      if (isCostedInbound && dto.unitCost != null) {
        const incomingCost = new Prisma.Decimal(dto.unitCost);
        const priorQty = priorLedger?.quantity ?? new Prisma.Decimal(0);
        const priorAvg = priorLedger?.avgUnitCost ?? null;
        newAvgUnitCost =
          priorAvg === null || priorQty.lte(0)
            ? incomingCost
            : priorQty
                .mul(priorAvg)
                .add(new Prisma.Decimal(delta).mul(incomingCost))
                .div(priorQty.add(delta));
        stampedUnitCost = incomingCost;
      }

      await db.stockLedger.upsert({
        where: {
          warehouseId_articleVariantId: {
            warehouseId: dto.warehouseId,
            articleVariantId: dto.articleVariantId,
          },
        },
        create: {
          tenantId,
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
          quantity: delta,
          avgUnitCost: newAvgUnitCost,
        },
        update: {
          quantity: { increment: delta },
          ...(newAvgUnitCost !== undefined ? { avgUnitCost: newAvgUnitCost } : {}),
        },
      });
    }

    const movement = await db.stockMovement.create({
      data: {
        tenantId,
        warehouseId: dto.warehouseId,
        articleVariantId: dto.articleVariantId,
        type: dto.type,
        quantity: dto.quantity,
        unitCost: stampedUnitCost,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        invoiceId: dto.invoiceId,
        invoiceLineId: dto.invoiceLineId,
      },
    });

    const ledger = await db.stockLedger.findUnique({
      where: {
        warehouseId_articleVariantId: {
          warehouseId: dto.warehouseId,
          articleVariantId: dto.articleVariantId,
        },
      },
      select: { quantity: true },
    });
    this.eventEmitter.emit('stock.updated', {
      tenantId,
      warehouseId: dto.warehouseId,
      articleVariantId: dto.articleVariantId,
      newQuantity: (ledger?.quantity ?? new Prisma.Decimal(0)).toString(),
    });

    return movement;
  }

  /** Sum of a variant's stock across every warehouse. Computed on read from
   * StockLedger, never cached/denormalized - a stored total would drift
   * from the ledger the moment anyone forgets to update it alongside a
   * movement. */
  async getConsolidatedStock(articleVariantId: string): Promise<Prisma.Decimal> {
    const result = await getTenantDb().stockLedger.aggregate({
      where: { articleVariantId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? new Prisma.Decimal(0);
  }

  async listReorderSuggestions(): Promise<ReorderSuggestion[]> {
    const db = getTenantDb();
    const minimums = await db.minimumStock.findMany();
    if (minimums.length === 0) {
      return [];
    }

    const ledgerRows = await db.stockLedger.findMany({
      where: {
        OR: minimums.map((m) => ({
          warehouseId: m.warehouseId,
          articleVariantId: m.articleVariantId,
        })),
      },
    });
    const ledgerByKey = new Map(
      ledgerRows.map((row) => [`${row.warehouseId}:${row.articleVariantId}`, row.quantity]),
    );

    return minimums
      .map((minimum) => ({
        warehouseId: minimum.warehouseId,
        articleVariantId: minimum.articleVariantId,
        minimumQuantity: minimum.minimumQuantity,
        currentQuantity:
          ledgerByKey.get(`${minimum.warehouseId}:${minimum.articleVariantId}`) ??
          new Prisma.Decimal(0),
      }))
      .filter((row) => row.currentQuantity.lt(row.minimumQuantity));
  }
}
