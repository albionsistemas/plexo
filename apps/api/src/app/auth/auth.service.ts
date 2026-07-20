import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import type { AuthenticatedUser } from '@plexo/types';
import * as bcrypt from 'bcryptjs';
import type { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
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
}
