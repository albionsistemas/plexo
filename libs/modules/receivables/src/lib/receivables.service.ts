import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, Prisma, type Invoice, type Company } from '@plexo/database';

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

    const customers = await db.company.findMany({
      where: { id: { in: grouped.map((g) => g.customerId) } },
    });
    const customerById = new Map<string, Company>(customers.map((c) => [c.id, c]));

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
    const customer = await db.company.findUnique({ where: { id: customerId } });
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
   * The invoices refreshOverdueStatuses() is about to flip below - i.e.
   * exactly the ones that just crossed into overdue, not every invoice
   * that's already OVERDUE (which would mean re-alerting on the same
   * invoice every single day forever). Call this BEFORE
   * refreshOverdueStatuses() in the same tenant context so it still sees
   * their pre-transition status; ReceivablesSchedulerService (apps/api)
   * is the one caller today, using the result to send one overdue-alert
   * email per invoice via InvoicingService.
   */
  listInvoicesBecomingOverdue(asOf: Date = new Date()): Promise<(Invoice & { customer: Company })[]> {
    return getTenantDb().invoice.findMany({
      where: {
        balanceDue: { gt: 0 },
        dueDate: { lt: asOf },
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Invoices already OVERDUE (not the ones just crossing into it - see
   * listInvoicesBecomingOverdue for those) that haven't been reminded in at
   * least intervalDays. Gated by TenantSettings.arReminderIntervalDays -
   * only called by ReceivablesSchedulerService when a tenant has opted
   * into recurring reminders (see runReminderSweepForCurrentTenant there).
   * Never reminded yet (lastOverdueReminderAt IS NULL) also qualifies -
   * that shouldn't normally happen (becomingOverdue + markReminderSent
   * together stamp every invoice the moment it turns OVERDUE), but an
   * invoice that turned OVERDUE before this feature existed would
   * otherwise never qualify for a first recurring reminder.
   */
  listInvoicesNeedingRecurringReminder(
    intervalDays: number,
    asOf: Date = new Date(),
  ): Promise<(Invoice & { customer: Company })[]> {
    const cutoff = new Date(asOf.getTime() - intervalDays * DAY_MS);
    return getTenantDb().invoice.findMany({
      where: {
        balanceDue: { gt: 0 },
        status: 'OVERDUE',
        OR: [{ lastOverdueReminderAt: null }, { lastOverdueReminderAt: { lte: cutoff } }],
      },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  /** Stamps "just reminded" on a batch of invoices - called once per sweep
   * after every alert email in it (initial + recurring) has gone out, so
   * the same invoice can't qualify for both listInvoicesBecomingOverdue
   * AND listInvoicesNeedingRecurringReminder on the very next day's run. */
  async markReminderSent(invoiceIds: string[], asOf: Date = new Date()): Promise<void> {
    if (invoiceIds.length === 0) return;
    await getTenantDb().invoice.updateMany({
      where: { id: { in: invoiceIds } },
      data: { lastOverdueReminderAt: asOf },
    });
  }

  /**
   * Syncs the stored Invoice.status to OVERDUE where it's warranted.
   * Reports above don't depend on this having run; this is only for code
   * elsewhere that filters directly on the status column. Called daily,
   * per tenant, by ReceivablesSchedulerService (apps/api) - also callable
   * manually via POST /receivables/overdue/refresh.
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
