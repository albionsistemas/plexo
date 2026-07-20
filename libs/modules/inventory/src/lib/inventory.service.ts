import { BadRequestException, Injectable } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  Prisma,
  type Article,
  type ArticleVariant,
  type Category,
  type MinimumStock,
  type Warehouse,
} from '@plexo/database';
import type { CreateArticleDto } from './dto/create-article.dto.js';
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

@Injectable()
export class InventoryService {
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

  createArticle(dto: CreateArticleDto): Promise<Article> {
    return getTenantDb().article.create({
      data: {
        tenantId: getTenantId(),
        name: dto.name,
        description: dto.description,
        unitOfMeasure: dto.unitOfMeasure,
        categoryId: dto.categoryId,
        taxConfigId: dto.taxConfigId,
      },
    });
  }

  listArticles(): Promise<(Article & { variants: ArticleVariant[] })[]> {
    return getTenantDb().article.findMany({
      include: { variants: true },
      orderBy: { name: 'asc' },
    });
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
   */
  async recordMovement(dto: RecordStockMovementDto) {
    if (dto.type === 'ADJUSTMENT') {
      if (dto.quantity === 0) {
        throw new BadRequestException('ADJUSTMENT quantity must not be zero');
      }
    } else if (dto.quantity <= 0) {
      throw new BadRequestException(`${dto.type} quantity must be a positive number`);
    }

    const db = getTenantDb();
    const tenantId = getTenantId();
    const delta = computeStockDelta(dto.type, dto.quantity);

    if (delta < 0) {
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
        },
        update: { quantity: { increment: delta } },
      });
    }

    return db.stockMovement.create({
      data: {
        tenantId,
        warehouseId: dto.warehouseId,
        articleVariantId: dto.articleVariantId,
        type: dto.type,
        quantity: dto.quantity,
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        invoiceId: dto.invoiceId,
      },
    });
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
