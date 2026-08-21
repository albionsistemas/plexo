import { Injectable } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import { InventoryService } from '@plexo/inventory';

export interface StockItem {
  articleVariantId: string;
  sku: string;
  articleName: string;
  quantity: number;
}

export interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  items: StockItem[];
  totalItems: number;
}

export interface RecentInvoice {
  id: string;
  customerName: string;
  total: number;
  balanceDue: number;
  status: string;
  issueDate: string;
  documentLetter: string;
  number: string;
}

export interface TodaySummary {
  invoiceCount: number;
  total: number;
  paidCount: number;
}

export interface LowStockAlert {
  warehouseName: string;
  sku: string;
  articleName: string;
  currentQuantity: number;
  minimumQuantity: number;
}

export interface SalesDay {
  date: string;
  total: number;
  count: number;
}

export interface DashboardSnapshot {
  stockByWarehouse: WarehouseStock[];
  recentInvoices: RecentInvoice[];
  todaySummary: TodaySummary;
  lowStockAlerts: LowStockAlert[];
  salesLast7Days: SalesDay[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly inventoryService: InventoryService) {}

  async getSnapshot(): Promise<DashboardSnapshot> {
    const db = getTenantDb();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

    const [warehouses, recentInvoices, todayInvoices, last7Invoices, reorderSuggestions] =
      await Promise.all([
        db.warehouse.findMany({
          include: {
            stockLedger: {
              include: { articleVariant: { include: { article: true } } },
            },
          },
          orderBy: { name: 'asc' },
        }),
        db.invoice.findMany({
          take: 10,
          orderBy: { issueDate: 'desc' },
          select: {
            id: true,
            customerName: true,
            total: true,
            balanceDue: true,
            status: true,
            issueDate: true,
            documentLetter: true,
            number: true,
          },
        }),
        db.invoice.findMany({
          where: { issueDate: { gte: todayStart }, status: { not: 'CANCELLED' } },
          select: { total: true, status: true },
        }),
        db.invoice.findMany({
          where: { issueDate: { gte: sevenDaysAgo }, status: { not: 'CANCELLED' } },
          select: { issueDate: true, total: true },
        }),
        this.inventoryService.listReorderSuggestions(),
      ]);

    // Stock by warehouse
    const stockByWarehouse: WarehouseStock[] = warehouses.map((wh) => {
      const items: StockItem[] = wh.stockLedger.map((sl) => ({
        articleVariantId: sl.articleVariantId,
        sku: sl.articleVariant.sku,
        articleName: sl.articleVariant.article.name,
        quantity: sl.quantity.toNumber(),
      }));
      return {
        warehouseId: wh.id,
        warehouseName: wh.name,
        items,
        totalItems: items.reduce((s, i) => s + i.quantity, 0),
      };
    });

    // Low stock alerts - misma comparación MinimumStock vs StockLedger que
    // usa la pantalla de Alertas de Inventario, resuelta una sola vez en
    // InventoryService.listReorderSuggestions() (antes reimplementada acá
    // en paralelo e independiente, ver PROGRESS.md).
    const lowStockAlerts: LowStockAlert[] = reorderSuggestions.map((s) => ({
      warehouseName: s.warehouseName,
      sku: s.sku,
      articleName: s.articleName,
      currentQuantity: s.currentQuantity,
      minimumQuantity: s.minimumQuantity,
    }));

    // Today summary
    const todayTotal = todayInvoices.reduce((s, inv) => s + inv.total.toNumber(), 0);
    const todaySummary: TodaySummary = {
      invoiceCount: todayInvoices.length,
      total: todayTotal,
      paidCount: todayInvoices.filter((inv) => inv.status === 'PAID').length,
    };

    // Sales last 7 days — group by date string
    const salesMap = new Map<string, { total: number; count: number }>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      salesMap.set(d.toISOString().split('T')[0]!, { total: 0, count: 0 });
    }
    for (const inv of last7Invoices) {
      const key = inv.issueDate.toISOString().split('T')[0]!;
      const existing = salesMap.get(key);
      if (existing) {
        existing.total += inv.total.toNumber();
        existing.count += 1;
      }
    }
    const salesLast7Days: SalesDay[] = Array.from(salesMap.entries()).map(([date, val]) => ({
      date,
      ...val,
    }));

    return {
      stockByWarehouse,
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        customerName: inv.customerName,
        total: inv.total.toNumber(),
        balanceDue: inv.balanceDue.toNumber(),
        status: inv.status,
        issueDate: inv.issueDate.toISOString(),
        documentLetter: inv.documentLetter,
        number: inv.number,
      })),
      todaySummary,
      lowStockAlerts,
      salesLast7Days,
    };
  }
}
