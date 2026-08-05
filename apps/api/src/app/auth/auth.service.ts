import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ActivityLogService, type MyActivityEntry } from '@plexo/activity-log';
import { getTenantDb, PrismaService, withTenantContext, type User } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import * as bcrypt from 'bcryptjs';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  tenantId: string;
  showOnlinePresence: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly activityLogService: ActivityLogService,
  ) {}

  /**
   * ip is logged separately from the credential check itself (see
   * recordLoginAttempt) rather than inside the same withTenantContext
   * transaction: throwing UnauthorizedException below would roll back
   * anything written in the transaction that produced `found`, and a
   * failed-login attempt is exactly the kind of activity that must still
   * be recorded even though the "real" operation didn't succeed.
   */
  async login(dto: LoginDto, ip: string | null): Promise<{ accessToken: string }> {
    const found = await withTenantContext(this.prisma, dto.tenantId, async () => {
      const db = getTenantDb();
      const tenant = await db.tenant.findUnique({ where: { id: dto.tenantId } });
      const user = await db.user.findUnique({
        where: { tenantId_email: { tenantId: dto.tenantId, email: dto.email } },
      });
      if (!user) {
        return null;
      }

      const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!passwordValid) {
        return null;
      }

      const moduleAccess = await db.userModuleAccess.findMany({
        where: { userId: user.id },
      });

      return { user, moduleAccess, tenantSuspended: tenant?.status === 'SUSPENDED' };
    });

    // Credenciales correctas pero tenant suspendido cuenta como login
    // fallido en el activity log - no se emitió ningún token.
    const loginSucceeded = !!found && !found.tenantSuspended;
    await this.recordLoginAttempt(dto.tenantId, found?.user.id, ip, loginSucceeded ? 'SUCCESS' : 'FAILURE');

    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }
    // Chequeado sólo acá, no en cada request (TenantStatus, ver
    // schema.prisma) - un JWT ya emitido es una foto fija, mismo criterio
    // ya aceptado para mustChangePassword/role (MustChangePasswordGuard).
    if (found.tenantSuspended) {
      throw new UnauthorizedException('Esta cuenta está suspendida - contactate con el administrador');
    }

    const payload: AuthenticatedUser = {
      sub: found.user.id,
      tenantId: dto.tenantId,
      email: found.user.email,
      role: found.user.role,
      moduleAccess: found.moduleAccess.map((grant) => ({
        module: grant.module,
        canRead: grant.canRead,
        canWrite: grant.canWrite,
      })),
      mustChangePassword: found.user.mustChangePassword,
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
  }

  /**
   * SuperAdmin-only (gated by PlatformAdminGuard at the controller, see
   * AdminTenantsController) - issues a short-lived token (15 min, not the
   * normal 8h default) for the SAME AuthenticatedUser payload shape as
   * login(), but for the TARGET user's own identity. mustChangePassword is
   * forced to false regardless of the target's real flag - otherwise the
   * SuperAdmin could get bounced to /profile mid-impersonation (see
   * MustChangePasswordGuard). impersonatedBy is the one addition to the
   * payload, purely informational (RolesGuard/ModuleAccessGuard/
   * MustChangePasswordGuard don't read it).
   *
   * Records one activity-log entry in the TARGET tenant (userId = the
   * admin's own id, entityLabel names both parties) - this is the only
   * place impersonation becomes visible to that tenant at all, since
   * ActivityLogInterceptor already logs this same request into the
   * ADMIN's own tenant (keyed by request.user.tenantId, which is the
   * admin's tenant, not the target's) without any code here.
   */
  async impersonate(
    targetTenantId: string,
    targetUserId: string,
    impersonatedBy: { id: string; email: string },
  ): Promise<{ accessToken: string; expiresAt: string }> {
    const EXPIRES_IN_MINUTES = 15;

    const found = await withTenantContext(this.prisma, targetTenantId, async () => {
      const db = getTenantDb();
      const user = await db.user.findUnique({ where: { id: targetUserId } });
      if (!user) {
        return null;
      }

      const moduleAccess = await db.userModuleAccess.findMany({ where: { userId: user.id } });

      await db.userActivityLog.create({
        data: {
          tenantId: targetTenantId,
          userId: impersonatedBy.id,
          action: 'admin.impersonate',
          outcome: 'SUCCESS',
          entityLabel: `${user.email} (impersonado por ${impersonatedBy.email})`,
        },
      });

      return { user, moduleAccess };
    });

    if (!found) {
      throw new NotFoundException('User not found in that tenant');
    }

    const payload: AuthenticatedUser = {
      sub: found.user.id,
      tenantId: targetTenantId,
      email: found.user.email,
      role: found.user.role,
      moduleAccess: found.moduleAccess.map((grant) => ({
        module: grant.module,
        canRead: grant.canRead,
        canWrite: grant.canWrite,
      })),
      mustChangePassword: false,
      impersonatedBy,
    };

    const accessToken = await this.jwtService.signAsync(payload, { expiresIn: `${EXPIRES_IN_MINUTES}m` });
    const expiresAt = new Date(Date.now() + EXPIRES_IN_MINUTES * 60_000).toISOString();
    return { accessToken, expiresAt };
  }

  private async recordLoginAttempt(
    tenantId: string,
    userId: string | undefined,
    ip: string | null,
    outcome: 'SUCCESS' | 'FAILURE',
  ): Promise<void> {
    try {
      await withTenantContext(this.prisma, tenantId, () =>
        getTenantDb().userActivityLog.create({
          data: { tenantId, userId, action: 'auth.login', outcome, ip },
        }),
      );
    } catch (err) {
      // A logging failure must never block login itself.
      this.logger.error(`Failed to record login attempt: ${(err as Error).message}`);
    }
  }

  /**
   * Profile reads/writes below all run inside a request already wrapped by
   * TenantContextInterceptor (these routes aren't @Public()), so they use
   * getTenantDb() directly rather than opening their own withTenantContext -
   * unlike login(), which runs before any such context exists.
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await getTenantDb().user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const user = await getTenantDb().user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl,
        showOnlinePresence: dto.showOnlinePresence,
      },
    });
    return toProfile(user);
  }

  /** Own recent actions, friendly phrasing only - see ActivityLogService
   * for why this stays deliberately free of IP/diff detail. */
  getMyActivity(userId: string): Promise<MyActivityEntry[]> {
    return this.activityLogService.listForUser(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await getTenantDb().user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const currentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await getTenantDb().user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }
}

function toProfile(user: User): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    tenantId: user.tenantId,
    showOnlinePresence: user.showOnlinePresence,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
  };
}
