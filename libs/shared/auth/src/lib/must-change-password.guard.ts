import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED_KEY } from './allow-when-password-change-required.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/**
 * 4th global guard (after JwtAuthGuard, which populates request.user) -
 * blocks every route for a user invited with a temporary password (see
 * UsersService.inviteUser) until they change it via /auth/change-password,
 * except that route itself and /auth/me (so the frontend can read the flag
 * and redirect there in the first place). @Public() routes are exempt too -
 * this guard still runs for them (all global guards run for every route),
 * but request.user is never set on a @Public() route, so there's nothing
 * to block.
 */
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WHEN_PASSWORD_CHANGE_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (user?.mustChangePassword) {
      throw new ForbiddenException('Debés cambiar tu contraseña antes de continuar');
    }
    return true;
  }
}
