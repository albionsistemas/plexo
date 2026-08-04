import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@plexo/types';
import type { FastifyRequest } from 'fastify';

type RequestWithUser = FastifyRequest & { user?: AuthenticatedUser };

/**
 * Gates the handful of cross-tenant "platform operator" endpoints (plan
 * catalog admin, tenant provisioning) - deliberately NOT a role on User
 * (every UserRole is scoped inside one tenant, see roles.decorator.ts) and
 * NOT @Public() either: the caller must still be a normal authenticated
 * tenant user (JwtAuthGuard already ran and populated request.user), it
 * just also has to be one of the operator emails listed in
 * PLATFORM_ADMIN_EMAILS. Single-operator-by-env-var on purpose - there's no
 * separate superadmin account/login, see PROGRESS.md's decision note.
 *
 * Applied explicitly via @UseGuards() on the 2 admin controllers, not
 * globally via APP_GUARD - unlike RolesGuard/ModuleAccessGuard, most routes
 * have nothing to do with platform administration at all.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user) {
      throw new ForbiddenException('No authenticated user on request');
    }

    const allowedEmails = (process.env['PLATFORM_ADMIN_EMAILS'] ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (!allowedEmails.includes(user.email.toLowerCase())) {
      throw new ForbiddenException('No tenés acceso de administrador de plataforma');
    }
    return true;
  }
}
