import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';
import { IS_PUBLIC_KEY } from './public.decorator.js';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/**
 * Verifies the bearer token and attaches its payload to request.user.
 * Deliberately not Passport-based: one strategy (JWT), one guard, no need
 * for the extra abstraction layer. Runs before RolesGuard/ModuleAccessGuard
 * (Nest always runs global guards in provider registration order).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    try {
      request.user = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
