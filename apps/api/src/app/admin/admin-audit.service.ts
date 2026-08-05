import { Injectable, Logger } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';

export interface AdminActivityEntry {
  id: string;
  occurredAt: Date;
  tenantId: string;
  tenantName: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  entityLabel: string | null;
  ip: string | null;
  outcome: string;
  errorMessage: string | null;
}

export interface AdminActivityPage {
  items: AdminActivityEntry[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListAllTenantsActivityParams {
  page: number;
  pageSize: number;
  tenantId?: string;
  from?: Date;
  to?: Date;
}

/**
 * Cross-tenant reader of the EXISTING UserActivityLog (no new audit table -
 * see PROGRESS.md's decision note). Reuses list_tenant_ids() + one
 * withTenantContext per tenant, same recipe as AdminTenantsService.listTenants,
 * then merges and paginates in memory - there is no single connection that
 * can see every tenant's rows at once under RLS, so a real SQL-level
 * ORDER BY/LIMIT across all tenants isn't possible here.
 *
 * Each tenant's fetch is bounded to `page * pageSize` rows (most recent
 * first) rather than its whole history: since it's the top-N most recent
 * rows of a subset, it's guaranteed to contain that tenant's contribution to
 * the global top-N once merged - deep pagination just re-fetches a larger
 * window per tenant, acceptable at this platform's scale.
 */
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listActivity(params: ListAllTenantsActivityParams): Promise<AdminActivityPage> {
    const { page, pageSize, tenantId, from, to } = params;
    const window = page * pageSize;

    const allTenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const tenantIds = tenantId ? allTenants.filter((t) => t.id === tenantId).map((t) => t.id) : allTenants.map((t) => t.id);

    const rows: AdminActivityEntry[] = [];
    for (const id of tenantIds) {
      try {
        const tenantRows = await withTenantContext(this.prisma, id, async () => {
          const db = getTenantDb();
          const tenant = await db.tenant.findUniqueOrThrow({ where: { id } });
          const logRows = await db.userActivityLog.findMany({
            where: from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : undefined,
            orderBy: { createdAt: 'desc' },
            take: window,
          });

          const userIds = [...new Set(logRows.map((row) => row.userId).filter((x): x is string => !!x))];
          const users = userIds.length
            ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
            : [];
          const userById = new Map(users.map((user) => [user.id, user]));

          return logRows.map((row) => ({
            id: row.id,
            occurredAt: row.createdAt,
            tenantId: id,
            tenantName: tenant.name,
            userId: row.userId,
            userName: (row.userId && userById.get(row.userId)?.name) ?? null,
            userEmail: (row.userId && userById.get(row.userId)?.email) ?? null,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            entityLabel: row.entityLabel,
            ip: row.ip,
            outcome: row.outcome,
            errorMessage: row.errorMessage,
          }));
        });
        rows.push(...tenantRows);
      } catch (err) {
        this.logger.error(`Failed to load activity for tenant ${id}: ${(err as Error).message}`);
      }
    }

    rows.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
    const start = (page - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    return { items, page, pageSize, hasMore: rows.length > start + pageSize };
  }
}
