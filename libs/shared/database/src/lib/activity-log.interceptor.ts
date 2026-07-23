import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { from, lastValueFrom, Observable } from 'rxjs';
import { AUDIT_ENTITY_KEY, type AuditEntityMeta } from './audit-entity.decorator.js';
import { buildEntityLabel, computeDiff } from './audit-diff.js';
import type { Prisma } from '../generated/client.js';
import { PrismaService } from './prisma.service.js';
import { getTenantDb, withTenantContext } from './tenant-context.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };
type Outcome = 'SUCCESS' | 'FAILURE';
type EntitySnapshot = Record<string, unknown> | null;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Minimal shape needed to fetch a row by id or by tenantId, without
 * depending on which of the ~20 Prisma model delegates it actually is -
 * the model name only exists as a string on the @AuditEntity decorator. */
interface FindableDelegate {
  findUnique(args: { where: Record<string, unknown> }): Promise<EntitySnapshot>;
}

/**
 * Records who did what, when, and from where - scoped to mutating
 * requests only (GETs would drown this in noise without adding much
 * audit value). Login attempts aren't covered here since they happen
 * before any request.user exists for this to key off of - see
 * AuthService.login(), which logs those directly.
 *
 * Writes in its OWN withTenantContext() transaction, deliberately separate
 * from whatever transaction TenantContextInterceptor opened for the
 * request itself: if the request's own transaction rolls back (the
 * business action failed), the activity log entry recording that failure
 * must still commit. This is also why it doesn't matter whether this
 * interceptor is registered before or after TenantContextInterceptor -
 * this always awaits the full request lifecycle before writing, and
 * always opens its own independent transaction rather than relying on
 * whatever tenant context (if any) is ambient at the time.
 *
 * Routes decorated with @AuditEntity (see audit-entity.decorator.ts) get a
 * before/after diff of the entity's own scalar columns, computed here and
 * nowhere else - the "before" fetch below opens its OWN separate
 * transaction too, for the same reason as the write: it must not depend on
 * interceptor registration order or on any ambient tenant context already
 * being open. Routes without the decorator keep logging exactly as before
 * this diffing existed (plain "METHOD /url", no entity/diff columns).
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.user?.tenantId;

    if (!tenantId || !MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const auditMeta = this.reflector.getAllAndOverride<AuditEntityMeta | undefined>(
      AUDIT_ENTITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    return from(this.handleWithLogging(request, tenantId, next, auditMeta));
  }

  private async handleWithLogging(
    request: RequestWithUser,
    tenantId: string,
    next: CallHandler,
    auditMeta: AuditEntityMeta | undefined,
  ): Promise<unknown> {
    const before =
      auditMeta && request.method !== 'POST'
        ? await this.fetchBefore(tenantId, auditMeta, request)
        : null;

    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await this.record(request, tenantId, 'SUCCESS', undefined, auditMeta, before, result);
      return result;
    } catch (err) {
      await this.record(request, tenantId, 'FAILURE', err, auditMeta, before, null);
      throw err;
    }
  }

  /** Never lets a lookup failure (bad model name, row not found) block the
   * real request - degrades to null "before", same tolerance the write
   * path below already has. */
  private async fetchBefore(
    tenantId: string,
    auditMeta: AuditEntityMeta,
    request: RequestWithUser,
  ): Promise<EntitySnapshot> {
    try {
      return await withTenantContext(
        this.prisma,
        tenantId,
        () => {
          const db = getTenantDb() as unknown as Record<string, FindableDelegate>;
          const delegate = db[auditMeta.modelName];
          const where = auditMeta.idParam
            ? { id: (request.params as Record<string, string> | undefined)?.[auditMeta.idParam] }
            : { tenantId };
          return delegate.findUnique({ where });
        },
        request.user?.sub,
      );
    } catch (err) {
      this.logger.error(
        `Failed to fetch pre-mutation snapshot for ${auditMeta.modelName}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async record(
    request: RequestWithUser,
    tenantId: string,
    outcome: Outcome,
    err: unknown,
    auditMeta: AuditEntityMeta | undefined,
    before: EntitySnapshot,
    after: unknown,
  ): Promise<void> {
    try {
      const afterSnapshot = (after ?? null) as EntitySnapshot;
      const verb = request.method === 'POST' ? 'created' : request.method === 'DELETE' ? 'deleted' : 'updated';

      await withTenantContext(
        this.prisma,
        tenantId,
        () =>
          getTenantDb().userActivityLog.create({
            data: {
              tenantId,
              userId: request.user?.sub,
              action: auditMeta ? `${auditMeta.modelName}.${verb}` : `${request.method} ${request.url}`,
              outcome,
              ip: request.ip ?? null,
              userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
              errorMessage: err instanceof Error ? err.message.slice(0, 500) : undefined,
              entityType: auditMeta?.modelName,
              entityId: auditMeta?.idParam
                ? (request.params as Record<string, string> | undefined)?.[auditMeta.idParam]
                : ((before?.['id'] ?? afterSnapshot?.['id']) as string | undefined),
              entityLabel: buildEntityLabel(afterSnapshot ?? before, auditMeta?.labelFields),
              // No diff on FAILURE: there's no real "after" state, and
              // diffing against the raw request body would be misleading
              // (DTOs don't map 1:1 to entity columns).
              changes:
                auditMeta && outcome === 'SUCCESS'
                  ? (computeDiff(before, afterSnapshot) as Prisma.InputJsonValue)
                  : undefined,
            },
          }),
        request.user?.sub,
      );
    } catch (logErr) {
      // A logging failure must never break the real request - by this
      // point it has already succeeded or failed on its own merits.
      this.logger.error(`Failed to record activity log: ${(logErr as Error).message}`);
    }
  }
}
