import { Injectable } from '@nestjs/common';
import { PrismaService, type SystemErrorLog } from '@plexo/database';

export interface CreateSystemErrorLogInput {
  statusCode: number;
  message: string;
  stack?: string;
  path: string;
  method: string;
  tenantId?: string;
  userId?: string;
}

/**
 * Global, no getTenantDb() - same reasoning as Plan (see SubscriptionService):
 * many 500s (a broken JWT, a request before any tenant context exists)
 * happen with no tenant to scope to, so this can't depend on one existing.
 */
@Injectable()
export class SystemErrorLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CreateSystemErrorLogInput): Promise<void> {
    await this.prisma.systemErrorLog.create({ data: input });
  }

  list(params: {
    limit?: number;
    tenantId?: string;
    statusCodeMin?: number;
    from?: Date;
    to?: Date;
  } = {}): Promise<SystemErrorLog[]> {
    const { limit = 100, tenantId, statusCodeMin, from, to } = params;
    return this.prisma.systemErrorLog.findMany({
      where: {
        ...(tenantId && { tenantId }),
        ...(statusCodeMin && { statusCode: { gte: statusCodeMin } }),
        ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
