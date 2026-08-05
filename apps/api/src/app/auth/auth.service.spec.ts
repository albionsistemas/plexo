import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { ActivityLogService } from '@plexo/activity-log';
import { tenantContextStorage, type PrismaService } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';

describe('AuthService', () => {
  const dto: LoginDto = {
    tenantId: 'tenant-1',
    email: 'owner@acme.test',
    password: 'correct-password',
  };

  function makePrisma(
    user: unknown,
    moduleAccess: unknown[] = [],
    tenant: unknown = { id: 'tenant-1', status: 'ACTIVE' },
  ) {
    const fakeTx = {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue(moduleAccess) },
      userActivityLog: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    };
    return {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
    } as unknown as PrismaService;
  }

  function makeJwt() {
    return {
      signAsync: jest.fn().mockResolvedValue('signed.jwt.token'),
    } as unknown as JwtService;
  }

  function makeActivityLogService() {
    return { listForUser: jest.fn() } as unknown as ActivityLogService;
  }

  it('throws when no user exists for that email in the tenant', async () => {
    const service = new AuthService(makePrisma(null), makeJwt(), makeActivityLogService());
    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('a-different-password', 4);
    const service = new AuthService(
      makePrisma({ id: 'user-1', email: dto.email, role: 'OWNER', passwordHash }),
      makeJwt(),
      makeActivityLogService(),
    );
    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('signs a token with the expected payload on valid credentials', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma(
        { id: 'user-1', email: dto.email, role: 'OWNER', passwordHash, mustChangePassword: false },
        [{ module: 'accounting', canRead: true, canWrite: false }],
      ),
      jwt,
      makeActivityLogService(),
    );

    const result = await service.login(dto, '127.0.0.1');

    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      tenantId: dto.tenantId,
      email: dto.email,
      role: 'OWNER',
      moduleAccess: [{ module: 'accounting', canRead: true, canWrite: false }],
      mustChangePassword: false,
    });
  });

  it('carries mustChangePassword through to the JWT payload for an invited user', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma({ id: 'user-1', email: dto.email, role: 'VIEWER', passwordHash, mustChangePassword: true }),
      jwt,
      makeActivityLogService(),
    );

    await service.login(dto, '127.0.0.1');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true }),
    );
  });

  it('throws when the tenant is suspended even with correct credentials', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma(
        { id: 'user-1', email: dto.email, role: 'OWNER', passwordHash, mustChangePassword: false },
        [],
        { id: 'tenant-1', status: 'SUSPENDED' },
      ),
      jwt,
      makeActivityLogService(),
    );

    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  describe('impersonate', () => {
    function makeImpersonationPrisma(user: unknown, moduleAccess: unknown[] = []) {
      const fakeTx = {
        user: { findUnique: jest.fn().mockResolvedValue(user) },
        userModuleAccess: { findMany: jest.fn().mockResolvedValue(moduleAccess) },
        userActivityLog: { create: jest.fn().mockResolvedValue({}) },
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      };
      const prisma = {
        $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx)),
      } as unknown as PrismaService;
      return { prisma, fakeTx };
    }

    const admin = { id: 'admin-1', email: 'super@plexo.test' };

    it('throws when the target user does not exist in that tenant', async () => {
      const { prisma } = makeImpersonationPrisma(null);
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService());

      await expect(service.impersonate('tenant-2', 'user-404', admin)).rejects.toThrow();
    });

    it('signs a 15-minute token forcing mustChangePassword false and carrying impersonatedBy', async () => {
      const jwt = makeJwt();
      const { prisma } = makeImpersonationPrisma(
        { id: 'user-2', email: 'target@acme.test', role: 'ADMIN', mustChangePassword: true },
        [{ module: 'sales', canRead: true, canWrite: true }],
      );
      const service = new AuthService(prisma, jwt, makeActivityLogService());

      const result = await service.impersonate('tenant-2', 'user-2', admin);

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(jwt.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-2',
          tenantId: 'tenant-2',
          email: 'target@acme.test',
          mustChangePassword: false,
          impersonatedBy: admin,
        }),
        { expiresIn: '15m' },
      );
    });

    it('records an activity log entry in the target tenant naming both parties', async () => {
      const { prisma, fakeTx } = makeImpersonationPrisma({
        id: 'user-2',
        email: 'target@acme.test',
        role: 'ADMIN',
        mustChangePassword: false,
      });
      const service = new AuthService(prisma, makeJwt(), makeActivityLogService());

      await service.impersonate('tenant-2', 'user-2', admin);

      expect(fakeTx.userActivityLog.create).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-2',
          userId: admin.id,
          action: 'admin.impersonate',
          outcome: 'SUCCESS',
          entityLabel: `target@acme.test (impersonado por ${admin.email})`,
        },
      });
    });
  });

  describe('changePassword', () => {
    function makeTenantScopedPrisma(user: unknown) {
      return {
        user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
      };
    }

    it('clears mustChangePassword once the password is successfully changed', async () => {
      const passwordHash = await bcrypt.hash('old-password', 4);
      const db = makeTenantScopedPrisma({ id: 'user-1', passwordHash, mustChangePassword: true });
      const service = new AuthService({} as PrismaService, makeJwt(), makeActivityLogService());

      await tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () =>
        service.changePassword('user-1', { currentPassword: 'old-password', newPassword: 'new-password-1' }),
      );

      expect(db.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String), mustChangePassword: false },
      });
    });
  });
});
