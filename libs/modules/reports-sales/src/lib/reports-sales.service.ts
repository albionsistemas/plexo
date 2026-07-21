import { Injectable } from '@nestjs/common';
import { getTenantDb, Prisma } from '@plexo/database';

export interface CustomerSales {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  totalSales: Prisma.Decimal;
}

export interface ProductSales {
  articleVariantId: string;
  sku: string;
  articleName: string;
  quantitySold: Prisma.Decimal;
  revenue: Prisma.Decimal;
}

function defaultRange(from?: Date, to?: Date): { from: Date; to: Date } {
  const rangeTo = to ?? new Date();
  const rangeFrom = from ?? new Date(rangeTo.getFullYear(), rangeTo.getMonth(), 1);
  return { from: rangeFrom, to: rangeTo };
}

@Injectable()
export class ReportsSalesService {
  async getSalesByCustomer(from?: Date, to?: Date): Promise<CustomerSales[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.invoice.groupBy({
      by: ['customerId'],
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      _sum: { total: true },
      _count: true,
    });
    if (grouped.length === 0) {
      return [];
    }

    const customers = await db.company.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
    });
    const customerById = new Map(customers.map((c) => [c.id, c]));

    return grouped
      .map((g) => ({
        customerId: g.customerId,
        customerName: customerById.get(g.customerId)?.name ?? 'Unknown',
        invoiceCount: g._count,
        totalSales: g._sum.total ?? new Prisma.Decimal(0),
      }))
      .sort((a, b) => b.totalSales.cmp(a.totalSales));
  }

  async getSalesByProduct(from?: Date, to?: Date): Promise<ProductSales[]> {
    const range = defaultRange(from, to);
    const db = getTenantDb();

    const grouped = await db.invoiceLine.groupBy({
      by: ['articleVariantId'],
      where: {
        invoice: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      },
      _sum: { quantity: true, lineTotal: true },
    });
    if (grouped.length === 0) {
      return [];
    }

    const variants = await db.articleVariant.findMany({
      where: { id: { in: grouped.map((g) => g.articleVariantId) } },
      include: { article: true },
    });
    const variantById = new Map(variants.map((v) => [v.id, v]));

    return grouped
      .map((g) => {
        const variant = variantById.get(g.articleVariantId);
        return {
          articleVariantId: g.articleVariantId,
          sku: variant?.sku ?? 'Unknown',
          articleName: variant?.article.name ?? 'Unknown',
          quantitySold: g._sum.quantity ?? new Prisma.Decimal(0),
          revenue: g._sum.lineTotal ?? new Prisma.Decimal(0),
        };
      })
      .sort((a, b) => b.revenue.cmp(a.revenue));
  }
}
