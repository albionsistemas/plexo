import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId, getUserId, Prisma } from '@plexo/database';
import { buildVariantLabel } from '@plexo/types';
import type { AddCartItemDto } from './dto/add-cart-item.dto.js';
import type { UpdateCartItemDto } from './dto/update-cart-item.dto.js';

const CART_ITEM_INCLUDE = {
  articleVariant: { include: { article: { include: { category: true } } } },
} satisfies Prisma.InventoryCartItemInclude;

type CartItemRow = Prisma.InventoryCartItemGetPayload<{ include: typeof CART_ITEM_INCLUDE }>;

export interface CartLineDetail {
  id: string;
  articleVariantId: string;
  articleId: string;
  articleName: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  categoryName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string | null;
}

/**
 * A single, persistent per-(tenant,user) "shopping list" over
 * ArticleVariants - see the doc comment on the InventoryCartItem model for
 * why this is one row per (user, variant) rather than a parent "cart" +
 * "cart line" pair. Nothing here ever clears the list on its own (not even
 * checkout, see inventory-cart-checkout at the composition root) - only an
 * explicit clear() does, per the 2026-08-03 decision that the same list
 * should be able to seed more than one downstream document.
 */
@Injectable()
export class InventoryCartService {
  list(): Promise<CartLineDetail[]> {
    return this.getCartLines();
  }

  /** "Add to cart" is one atomic upsert-increment (quantity accumulates if
   * the variant's already in the list) - same race-safety idiom as
   * PurchaseNumberingService.nextNumber(), a single statement rather than a
   * read-then-write. */
  async addItem(dto: AddCartItemDto): Promise<CartLineDetail> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const userId = requireUserId();

    const variant = await db.articleVariant.findUnique({ where: { id: dto.articleVariantId } });
    if (!variant) {
      throw new NotFoundException('Article variant not found');
    }

    const row = await db.inventoryCartItem.upsert({
      where: {
        tenantId_userId_articleVariantId: {
          tenantId,
          userId,
          articleVariantId: dto.articleVariantId,
        },
      },
      create: {
        tenantId,
        userId,
        articleVariantId: dto.articleVariantId,
        quantity: dto.quantity,
        notes: dto.notes,
      },
      update: {
        quantity: { increment: dto.quantity },
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: CART_ITEM_INCLUDE,
    });
    return toLineDetail(row);
  }

  async updateQuantity(id: string, dto: UpdateCartItemDto): Promise<CartLineDetail> {
    await this.requireOwnItem(id);
    const row = await getTenantDb().inventoryCartItem.update({
      where: { id },
      data: { quantity: dto.quantity },
      include: CART_ITEM_INCLUDE,
    });
    return toLineDetail(row);
  }

  async removeItem(id: string): Promise<void> {
    await this.requireOwnItem(id);
    await getTenantDb().inventoryCartItem.delete({ where: { id } });
  }

  async clear(): Promise<void> {
    await getTenantDb().inventoryCartItem.deleteMany({ where: { userId: requireUserId() } });
  }

  /** Shared resolver reused by the PDF export here and, from
   * inventory-cart-checkout (apps/api composition root), by the
   * multi-supplier RFQ split and the sales Quote checkout - same rows
   * list() returns. */
  async getCartLines(): Promise<CartLineDetail[]> {
    const rows = await getTenantDb().inventoryCartItem.findMany({
      where: { userId: requireUserId() },
      include: CART_ITEM_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toLineDetail);
  }

  /** RLS already scopes every query to the current tenant - this extra
   * check scopes to the current *user* within that tenant, since two users
   * of the same tenant each have their own list (userId isn't part of
   * RLS's policy, only tenantId is). */
  private async requireOwnItem(id: string): Promise<void> {
    const existing = await getTenantDb().inventoryCartItem.findUnique({ where: { id } });
    if (!existing || existing.userId !== requireUserId()) {
      throw new NotFoundException('Cart item not found');
    }
  }
}

function requireUserId(): string {
  const userId = getUserId();
  if (!userId) {
    throw new BadRequestException('An authenticated user is required');
  }
  return userId;
}

function toLineDetail(row: CartItemRow): CartLineDetail {
  const unitPrice = row.articleVariant.unitPrice.toNumber();
  const quantity = row.quantity.toNumber();
  return {
    id: row.id,
    articleVariantId: row.articleVariantId,
    articleId: row.articleVariant.articleId,
    articleName: row.articleVariant.article.name,
    variantLabel: buildVariantLabel(row.articleVariant),
    sku: row.articleVariant.sku,
    imageUrl: row.articleVariant.article.imageUrl,
    categoryName: row.articleVariant.article.category?.name ?? null,
    unitPrice,
    quantity,
    lineTotal: unitPrice * quantity,
    notes: row.notes,
  };
}
