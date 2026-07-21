import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, withTenantContext } from '@plexo/database';
import { InvoicingService } from '@plexo/invoicing';
import { ReceivablesService } from '@plexo/receivables';

/**
 * Daily sweep across every tenant: marks invoices OVERDUE where warranted
 * and emails one alert per invoice that just crossed into it. Runs outside
 * any HTTP request, so there's no TenantContextInterceptor to open a
 * per-tenant transaction for us - list_tenant_ids() (a SECURITY DEFINER
 * Postgres function, see its migration) is what lets plexo_app enumerate
 * tenants at all; withTenantContext() then opens one transaction per
 * tenant, same helper login uses before any request context exists.
 *
 * One tenant failing (bad data, a transient DB error) is logged and
 * skipped rather than aborting the sweep for every other tenant.
 */
@Injectable()
export class ReceivablesSchedulerService {
  private readonly logger = new Logger(ReceivablesSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receivablesService: ReceivablesService,
    private readonly invoicingService: InvoicingService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async refreshOverdueInvoicesForAllTenants(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM list_tenant_ids() AS id`;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const becomingOverdue = await this.receivablesService.listInvoicesBecomingOverdue();
          const { updated } = await this.receivablesService.refreshOverdueStatuses();
          this.logger.log(`Tenant ${tenantId}: ${updated} invoice(s) marked OVERDUE`);

          for (const invoice of becomingOverdue) {
            if (invoice.customer.email) {
              await this.invoicingService.sendOverdueInvoiceAlert(invoice, invoice.customer.email);
            }
          }
        });
      } catch (err) {
        this.logger.error(
          `Failed to refresh overdue invoices for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }
  }
}
