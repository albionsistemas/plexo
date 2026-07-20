import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client.js';

/**
 * Connects as the restricted `plexo_app` role (APP_DATABASE_URL), never the
 * migration/admin role — that's what makes FORCE ROW LEVEL SECURITY apply.
 *
 * Do not inject this directly into business services: it has no tenant
 * context set, so RLS policies will hide every row. Business code should
 * depend on `getTenantDb()` (tenant-context.ts) instead, which is only
 * populated inside a request wrapped by TenantContextInterceptor. This
 * service exists so that interceptor has a client to open transactions on.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env['APP_DATABASE_URL'];
    if (!connectionString) {
      throw new Error('APP_DATABASE_URL is not set');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to Postgres as plexo_app');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
