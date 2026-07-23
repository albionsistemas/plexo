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

      return { user, moduleAccess };
    });

    await this.recordLoginAttempt(dto.tenantId, found?.user.id, ip, found ? 'SUCCESS' : 'FAILURE');

    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
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
    };

    return { accessToken: await this.jwtService.signAsync(payload) };
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
    await getTenantDb().user.update({ where: { id: userId }, data: { passwordHash } });
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
    createdAt: user.createdAt,
  };
}
