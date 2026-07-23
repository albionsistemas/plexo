import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { InvoicingService } from '@plexo/invoicing';
import { ReceivablesService } from '@plexo/receivables';
import { TenantSettingsService } from '@plexo/tenant-settings';

export interface ReminderSweepResult {
  becomingOverdue: number;
  recurring: number;
}

/**
 * Daily sweep across every tenant: marks invoices OVERDUE where warranted
 * and emails one alert per invoice that just crossed into it, plus - for
 * tenants that opted in via TenantSettings.arReminderIntervalDays - a
 * repeat alert for invoices still unpaid after that many days. Runs
 * outside any HTTP request, so there's no TenantContextInterceptor to open
 * a per-tenant transaction for us - list_tenant_ids() (a SECURITY DEFINER
 * Postgres function, see its migration) is what lets plexo_app enumerate
 * tenants at all; withTenantContext() then opens one transaction per
 * tenant, same helper login uses before any request context exists.
 *
 * One tenant failing (bad data, a transient DB error) is logged and
 * skipped rather than aborting the sweep for every other tenant.
 *
 * runReminderSweepForCurrentTenant() is the tenant-scoped core, factored
 * out so SchedulerController (apps/api) can also call it directly for a
 * single tenant on demand ("Ejecutar ahora" in Preferencias) - that path
 * already runs inside a request-scoped tenant context (TenantContextInterceptor),
 * so it calls this without the withTenantContext wrapper the cron needs.
 */
@Injectable()
export class ReceivablesSchedulerService {
  private readonly logger = new Logger(ReceivablesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receivablesService: ReceivablesService,
    private readonly invoicingService: InvoicingService,
    private readonly tenantSettingsService: TenantSettingsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async refreshOverdueInvoicesForAllTenants(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM list_tenant_ids() AS id`;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const { becomingOverdue, recurring } = await this.runReminderSweepForCurrentTenant();
          this.logger.log(
            `Tenant ${tenantId}: ${becomingOverdue} invoice(s) newly overdue, ${recurring} recurring reminder(s) sent`,
          );
        });
      } catch (err) {
        this.logger.error(
          `Failed to refresh overdue invoices for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }
  }

  /** Assumes tenant context is already established by the caller (either
   * withTenantContext, for the cron, or the request-scoped one an HTTP
   * controller already runs inside). */
  async runReminderSweepForCurrentTenant(): Promise<ReminderSweepResult> {
    const settings = await this.tenantSettingsService.getSettings();
    const becomingOverdue = await this.receivablesService.listInvoicesBecomingOverdue();
    await this.receivablesService.refreshOverdueStatuses();

    const remindedIds: string[] = [];
    for (const invoice of becomingOverdue) {
      if (invoice.customer.email) {
        await this.invoicingService.sendOverdueInvoiceAlert(invoice, invoice.customer.email);
      }
      remindedIds.push(invoice.id);
    }

    let recurringCount = 0;
    if (settings.arReminderIntervalDays) {
      const recurring = await this.receivablesService.listInvoicesNeedingRecurringReminder(
        settings.arReminderIntervalDays,
      );
      for (const invoice of recurring) {
        if (invoice.customer.email) {
          await this.invoicingService.sendOverdueInvoiceAlert(invoice, invoice.customer.email);
        }
        remindedIds.push(invoice.id);
      }
      recurringCount = recurring.length;
    }

    // Both the just-became-overdue and the recurring batch get stamped
    // together, in one call, at the end - otherwise an invoice reminded
    // here as "becoming overdue" would immediately also qualify for
    // listInvoicesNeedingRecurringReminder in the very same run (its
    // lastOverdueReminderAt is still null/stale until this runs).
    await this.receivablesService.markReminderSent(remindedIds);

    return { becomingOverdue: becomingOverdue.length, recurring: recurringCount };
  }

  /** "Resetear cron" in Preferencias: pushes every currently-OVERDUE
   * invoice's reminder clock forward to now WITHOUT emailing anyone -
   * for when you want to buy N more days before the next recurring
   * reminder without re-notifying customers who already got one. */
  async resetReminderClockForCurrentTenant(): Promise<{ reset: number }> {
    const overdue = await getTenantDb().invoice.findMany({
      where: { balanceDue: { gt: 0 }, status: 'OVERDUE' },
      select: { id: true },
    });
    const ids = overdue.map((i) => i.id);
    await this.receivablesService.markReminderSent(ids);
    return { reset: ids.length };
  }
}
