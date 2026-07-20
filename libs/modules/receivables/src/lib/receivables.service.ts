import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type Invoice, type Customer } from '@plexo/database';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AgingBuckets {
  current: Prisma.Decimal;
  days1to30: Prisma.Decimal;
  days31to60: Prisma.Decimal;
  days61to90: Prisma.Decimal;
  days90Plus: Prisma.Decimal;
}

export interface CustomerAging extends AgingBuckets {
  customerId: string;
  customerName: string;
  totalOutstanding: Prisma.Decimal;
}

export interface CustomerBalance {
  customerId: string;
  customerName: string;
  creditLimit: Prisma.Decimal;
  outstanding: Prisma.Decimal;
  availableCredit: Prisma.Decimal;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  creditLimit: Prisma.Decimal;
  totalOutstanding: Prisma.Decimal;
  invoices: Invoice[];
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

/** No dueDate at all -> can't establish overdue-ness, treat as current. */
function bucketFor(daysOverdue: number): keyof AgingBuckets {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'days1to30';
  if (daysOverdue <= 60) return 'days31to60';
  if (daysOverdue <= 90) return 'days61to90';
  return 'days90Plus';
}

@Injectable()
export class ReceivablesService {
  /**
   * Buckets every open invoice (balanceDue > 0) by days overdue, per
   * customer. Computed on read from dueDate/balanceDue directly, not from
   * Invoice.status - nothing keeps that column fresh in real time (see
   * refreshOverdueStatuses), so a report that trusted it could show a
   * customer as current when they're actually 60 days late.
   */
  async getAgingReport(asOf: Date = new Date()): Promise<CustomerAging[]> {
    const invoices = await getTenantDb().invoice.findMany({
      where: { balanceDue: { gt: 0 } },
      include: { customer: true },
    });

    const byCustomer = new Map<string, CustomerAging>();
    for (const invoice of invoices) {
      const daysOverdue = invoice.dueDate
        ? Math.floor((asOf.getTime() - invoice.dueDate.getTime()) / DAY_MS)
        : -1;
      const bucket = bucketFor(daysOverdue);

      let entry = byCustomer.get(invoice.customerId);
      if (!entry) {
        entry = {
          customerId: invoice.customerId,
          customerName: invoice.customer.name,
          totalOutstanding: new Prisma.Decimal(0),
          ...emptyBuckets(),
        };
        byCustomer.set(invoice.customerId, entry);
      }

      entry[bucket] = entry[bucket].add(invoice.balanceDue);
      entry.totalOutstanding = entry.totalOutstanding.add(invoice.balanceDue);
    }

    return [...byCustomer.values()].sort((a, b) => b.totalOutstanding.cmp(a.totalOutstanding));
  }

  async listCustomerBalances(): Promise<CustomerBalance[]> {
    const db = getTenantDb();
    const grouped = await db.invoice.groupBy({
      by: ['customerId'],
      where: { balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });
    if (grouped.length === 0) {
      return [];
    }

    const customers = await db.customer.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
    });
    const customerById = new Map<string, Customer>(customers.map((c) => [c.id, c]));

    return grouped
      .map((g) => {
        const customer = customerById.get(g.customerId);
        const outstanding = g._sum.balanceDue ?? new Prisma.Decimal(0);
        const creditLimit = customer?.creditLimit ?? new Prisma.Decimal(0);
        return {
          customerId: g.customerId,
          customerName: customer?.name ?? 'Unknown',
          creditLimit,
          outstanding,
          availableCredit: creditLimit.sub(outstanding),
        };
      })
      .sort((a, b) => b.outstanding.cmp(a.outstanding));
  }

  async getCustomerStatement(customerId: string): Promise<CustomerStatement> {
    const db = getTenantDb();
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const invoices = await db.invoice.findMany({
      where: { customerId, balanceDue: { gt: 0 } },
      orderBy: { dueDate: 'asc' },
    });
    const totalOutstanding = invoices.reduce(
      (sum, invoice) => sum.add(invoice.balanceDue),
      new Prisma.Decimal(0),
    );

    return {
      customerId,
      customerName: customer.name,
      creditLimit: customer.creditLimit,
      totalOutstanding,
      invoices,
    };
  }

  listOverdueInvoices(asOf: Date = new Date()): Promise<Invoice[]> {
    return getTenantDb().invoice.findMany({
      where: { balanceDue: { gt: 0 }, dueDate: { lt: asOf } },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Syncs the stored Invoice.status to OVERDUE where it's warranted -
   * nothing does this automatically yet (no scheduler wired up in this
   * project), so call it manually or from a future cron. Reports above
   * don't depend on this having run; this is only for code elsewhere that
   * filters directly on the status column.
   */
  async refreshOverdueStatuses(asOf: Date = new Date()): Promise<{ updated: number }> {
    const result = await getTenantDb().invoice.updateMany({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: asOf },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      data: { status: 'OVERDUE' },
    });
    return { updated: result.count };
  }
}
