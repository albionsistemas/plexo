import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';

type Verb = 'created' | 'updated' | 'deleted';

/** Natural-language noun phrase per entityType, shared by the friendly
 * own-activity sentence and the admin table's "Entidad" column. Extending
 * @AuditEntity to a new model just needs an entry here - everything else
 * (diffing, storage) already works generically. */
const ENTITY_NOUN: Record<string, string> = {
  company: 'Empresa',
  person: 'Contacto',
  tenantSettings: 'la configuración del tenant',
};

const VERB_LABEL: Record<Verb, string> = {
  created: 'Creaste',
  updated: 'Editaste',
  deleted: 'Eliminaste',
};

export interface MyActivityEntry {
  id: string;
  action: string;
  occurredAt: Date;
}

export interface TenantActivityEntry {
  id: string;
  occurredAt: Date;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  entityType: string | null;
  entityTypeLabel: string | null;
  entityId: string | null;
  entityLabel: string | null;
  changes: unknown;
  ip: string | null;
  outcome: string;
  errorMessage: string | null;
}

export interface TenantActivityPage {
  items: TenantActivityEntry[];
  page: number;
  pageSize: number;
}

export interface ListForTenantParams {
  page: number;
  pageSize: number;
  userId?: string;
  entityType?: string;
}

function parseVerb(action: string): Verb | null {
  if (action.endsWith('.created')) return 'created';
  if (action.endsWith('.updated')) return 'updated';
  if (action.endsWith('.deleted')) return 'deleted';
  return null;
}

/** Own-activity phrasing for a row without @AuditEntity metadata (either a
 * legacy "METHOD /url" action, or the login attempt AuthService writes
 * directly) - derived only from the HTTP method prefix, never the URL, so
 * no route/resource detail leaks into the simple view. */
function describeUndecoratedAction(action: string): string {
  if (action === 'auth.login') return 'Iniciaste sesión';
  const method = action.split(' ')[0];
  switch (method) {
    case 'POST':
      return 'Creaste algo';
    case 'PATCH':
    case 'PUT':
      return 'Actualizaste algo';
    case 'DELETE':
      return 'Eliminaste algo';
    default:
      return 'Realizaste una acción';
  }
}

function describeAction(row: { action: string; entityType: string | null; entityLabel: string | null; outcome: string }): string {
  const verb = row.entityType ? parseVerb(row.action) : null;
  const base =
    verb && row.entityType
      ? `${VERB_LABEL[verb]} ${ENTITY_NOUN[row.entityType] ?? row.entityType}${row.entityLabel ? ` ${row.entityLabel}` : ''}`
      : describeUndecoratedAction(row.action);
  return row.outcome === 'FAILURE' ? `${base} (no se pudo completar)` : base;
}

@Injectable()
export class ActivityLogService {
  /** Own recent actions, friendly phrasing only - deliberately excludes
   * ip/userAgent/changes/entityId/errorMessage so sensitive detail never
   * reaches a non-admin view (see ActivityLogController.list for the
   * detailed tenant-wide equivalent, gated to OWNER/ADMIN). */
  async listForUser(userId: string, limit = 50): Promise<MyActivityEntry[]> {
    const rows = await getTenantDb().userActivityLog.findMany({
      where: { tenantId: getTenantId(), userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      action: describeAction(row),
      occurredAt: row.createdAt,
    }));
  }

  /** Full detail for every user in the tenant - gated to OWNER/ADMIN at
   * the controller level. userId/entityType filters are optional and
   * additive to the tenant scope RLS already enforces. */
  async listForTenant(params: ListForTenantParams): Promise<TenantActivityPage> {
    const { page, pageSize, userId, entityType } = params;
    const db = getTenantDb();

    const rows = await db.userActivityLog.findMany({
      where: {
        tenantId: getTenantId(),
        ...(userId && { userId }),
        ...(entityType && { entityType }),
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const userIds = [...new Set(rows.map((row) => row.userId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      page,
      pageSize,
      items: rows.map((row) => ({
        id: row.id,
        occurredAt: row.createdAt,
        userId: row.userId,
        userName: (row.userId && userById.get(row.userId)?.name) ?? null,
        userEmail: (row.userId && userById.get(row.userId)?.email) ?? null,
        entityType: row.entityType,
        entityTypeLabel: row.entityType ? (ENTITY_NOUN[row.entityType] ?? row.entityType) : null,
        entityId: row.entityId,
        entityLabel: row.entityLabel,
        changes: row.changes,
        ip: row.ip,
        outcome: row.outcome,
        errorMessage: row.errorMessage,
      })),
    };
  }
}
