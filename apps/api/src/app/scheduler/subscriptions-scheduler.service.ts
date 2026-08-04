import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService, withTenantContext } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';

/**
 * Daily sweep across every tenant, same list_tenant_ids() + withTenantContext
 * recipe as ReceivablesSchedulerService (see that file's docstring for why
 * this needs its own tenant loop instead of a request-scoped tenant
 * context - it runs outside any HTTP request). Flips TRIALING -> EXPIRED
 * once trialEndsAt has passed - deliberately does NOT touch ACTIVE/PAST_DUE
 * at all, since there is no real payment gateway wired up yet to signal a
 * failed charge; that transition, if ever needed, is set by hand via
 * /api/admin/plans's operator.
 */
@Injectable()
export class SubscriptionsSchedulerService {
  private readonly logger = new Logger(SubscriptionsSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireTrialsForAllTenants(): Promise<void> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;

    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const expired = await this.subscriptionService.expireIfTrialEnded();
          if (expired) {
            this.logger.log(`Tenant ${tenantId}: trial expired`);
          }
        });
      } catch (err) {
        this.logger.error(`Failed to check trial expiry for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }
}
