import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { SystemErrorLogService } from './system-error-log.service.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/**
 * Wraps Nest's default exception handling (BaseExceptionFilter) purely to
 * add a side effect - the actual response shape/status sent to the client
 * is untouched, since super.catch() still does all of that. Only 5xx gets
 * persisted: 4xx (bad input, 404, auth failures) is normal traffic, not an
 * incident - logging every one of those would bury the signal.
 *
 * Registered via APP_FILTER (see app.module.ts), which is why HttpAdapterHost
 * is constructor-injected rather than passed by hand - Nest resolves it the
 * same way it does for its own internal exception handling.
 */
@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    private readonly systemErrorLogService: SystemErrorLogService,
    { httpAdapter }: HttpAdapterHost,
  ) {
    super(httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    if (statusCode >= 500) {
      const request = host.switchToHttp().getRequest<RequestWithUser>();
      this.systemErrorLogService
        .record({
          statusCode,
          message: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
          path: request.url,
          method: request.method,
          tenantId: request.user?.tenantId,
          userId: request.user?.sub,
        })
        .catch((err) => {
          // A logging failure must never mask the original error response.
          this.logger.error(`Failed to record system error log: ${(err as Error).message}`);
        });
    }

    super.catch(exception, host);
  }
}
