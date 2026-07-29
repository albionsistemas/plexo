import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type Company, type PurchaseInvoice } from '@plexo/database';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgingBuckets {
  current: Prisma.Decimal;
  days1to30: Prisma.Decimal;
  days31to60: Prisma.Decimal;
  days61to90: Prisma.Decimal;
  days90Plus: Prisma.Decimal;
}

export interface SupplierAging extends AgingBuckets {
  supplierId: string;
  supplierName: string;
  totalOutstanding: Prisma.Decimal;
}

export interface SupplierBalance {
  supplierId: string;
  supplierName: string;
  outstanding: Prisma.Decimal;
}

export interface SupplierStatement {
  supplierId: string;
  supplierName: string;
  totalOutstanding: Prisma.Decimal;
  invoices: PurchaseInvoice[];
}

function emptyBuckets(): AgingBuckets {
  return {
    current: new Prisma.Decimal(0),
    days1to30: new Prisma.Decimal(0),
    days31to60: new Prisma.Decimal(0),
    days61to90: new Prisma.Decimal(0),
    days90Plus: new Prisma.Decimal(0),
  };
}

/** No dueDate at all -> can't establish overdue-ness, treat as current -
 * same criterion as ReceivablesService.bucketFor (the AR equivalent). */
function bucketFor(daysOverdue: number): keyof AgingBuckets {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'days90Plus';
}

/**
 * Pure reporting on top of PurchaseInvoice/SupplierPayment (created by
 * @plexo/purchases' PurchaseInvoiceService) - never imports that Service
 * directly (this repo's rule: a lib module never imports another module's
 * Service), reads the tables straight via getTenantDb() instead, same
 * relationship ReceivablesService already has with InvoicingService's
 * Invoice/Receipt.
 */
@Injectable()
export class PayablesService {
  /** Mirrors ReceivablesService.getAgingReport() field-for-field, customer
   * -> supplier. Computed on read from dueDate/balanceDue directly, not
   * from PurchaseInvoice.status. */
  async getAgingReport(asOf: Date = new Date()): Promise<SupplierAging[]> {
    const invoices = await getTenantDb().purchaseInvoice.findMany({
      where: { balanceDue: { gt: 0 } },
      include: { supplier: true },
    });

    const bySupplier = new Map<string, SupplierAging>();
    for (const invoice of invoices) {
      const daysOverdue = invoice.dueDate
        ? Math.floor((asOf.getTime() - invoice.dueDate.getTime()) / DAY_MS)
        : -1;
      const bucket = bucketFor(daysOverdue);

      let entry = bySupplier.get(invoice.supplierId);
      if (!entry) {
        entry = {
          supplierId: invoice.supplierId,
          supplierName: invoice.supplier.name,
          totalOutstanding: new Prisma.Decimal(0),
          ...emptyBuckets(),
        };
        bySupplier.set(invoice.supplierId, entry);
      }

      entry[bucket] = entry[bucket].add(invoice.balanceDue);
      entry.totalOutstanding = entry.totalOutstanding.add(invoice.balanceDue);
    }

    return [...bySupplier.values()].sort((a, b) => b.totalOutstanding.cmp(a.totalOutstanding));
  }

  /** Mirrors ReceivablesService.listCustomerBalances() - no credit-limit
   * column on the purchases side (Company.creditLimit is meaningful for a
   * CUSTOMER extending US credit, not the other way around), so this is
   * just outstanding balance per supplier. */
  async listSupplierBalances(): Promise<SupplierBalance[]> {
    const db = getTenantDb();
    const grouped = await db.purchaseInvoice.groupBy({
      by: ['supplierId'],
      where: { balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });
    if (grouped.length === 0) {
      return [];
    }

    const suppliers = await db.company.findMany({
      where: { id: { in: grouped.map((g) => g.supplierId) } },
    });
    const supplierById = new Map<string, Company>(suppliers.map((s) => [s.id, s]));

    return grouped
      .map((g) => ({
        supplierId: g.supplierId,
        supplierName: supplierById.get(g.supplierId)?.name ?? 'Unknown',
        outstanding: g._sum.balanceDue ?? new Prisma.Decimal(0),
      }))
      .sort((a, b) => b.outstanding.cmp(a.outstanding));
  }

  async getSupplierStatement(supplierId: string): Promise<SupplierStatement> {
    const db = getTenantDb();
    const supplier = await db.company.findUnique({ where: { id: supplierId } });
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const invoices = await db.purchaseInvoice.findMany({
      where: { supplierId, balanceDue: { gt: 0 } },
      orderBy: { dueDate: 'asc' },
    });
    const totalOutstanding = invoices.reduce(
      (sum, invoice) => sum.add(invoice.balanceDue),
      new Prisma.Decimal(0),
    );

    return { supplierId, supplierName: supplier.name, totalOutstanding, invoices };
  }
}
