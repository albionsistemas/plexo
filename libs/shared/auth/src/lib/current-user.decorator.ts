import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<FastifyRequest & { user: AuthenticatedUser }>();
    return request.user;
  },
);
