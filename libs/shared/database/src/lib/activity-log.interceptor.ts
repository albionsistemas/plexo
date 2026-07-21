import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { from, lastValueFrom, Observable } from 'rxjs';
import { PrismaService } from './prisma.service.js';
import { getTenantDb, withTenantContext } from './tenant-context.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };
type Outcome = 'SUCCESS' | 'FAILURE';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
 */
@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const tenantId = request.user?.tenantId;

    if (!tenantId || !MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    return from(this.handleWithLogging(request, tenantId, next));
  }

  private async handleWithLogging(
    request: RequestWithUser,
    tenantId: string,
    next: CallHandler,
  ): Promise<unknown> {
    try {
      const result = await lastValueFrom(next.handle(), { defaultValue: undefined });
      await this.record(request, tenantId, 'SUCCESS');
      return result;
    } catch (err) {
      await this.record(request, tenantId, 'FAILURE', err);
      throw err;
    }
  }

  private async record(
    request: RequestWithUser,
    tenantId: string,
    outcome: Outcome,
    err?: unknown,
  ): Promise<void> {
    try {
      await withTenantContext(
        this.prisma,
        tenantId,
        () =>
          getTenantDb().userActivityLog.create({
            data: {
              tenantId,
              userId: request.user?.sub,
              action: `${request.method} ${request.url}`,
              outcome,
              ip: request.ip ?? null,
              userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
              errorMessage: err instanceof Error ? err.message.slice(0, 500) : undefined,
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
