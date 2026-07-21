import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import type { LoginDto } from './dto/login.dto.js';

describe('AuthService', () => {
  const dto: LoginDto = {
    tenantId: 'tenant-1',
    email: 'owner@acme.test',
    password: 'correct-password',
  };

  function makePrisma(user: unknown, moduleAccess: unknown[] = []) {
    const fakeTx = {
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

  it('throws when no user exists for that email in the tenant', async () => {
    const service = new AuthService(makePrisma(null), makeJwt());
    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the password does not match', async () => {
    const passwordHash = await bcrypt.hash('a-different-password', 4);
    const service = new AuthService(
      makePrisma({ id: 'user-1', email: dto.email, role: 'OWNER', passwordHash }),
      makeJwt(),
    );
    await expect(service.login(dto, '127.0.0.1')).rejects.toThrow(UnauthorizedException);
  });

  it('signs a token with the expected payload on valid credentials', async () => {
    const passwordHash = await bcrypt.hash(dto.password, 4);
    const jwt = makeJwt();
    const service = new AuthService(
      makePrisma(
        { id: 'user-1', email: dto.email, role: 'OWNER', passwordHash },
        [{ module: 'accounting', canRead: true, canWrite: false }],
      ),
      jwt,
    );

    const result = await service.login(dto, '127.0.0.1');

    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      tenantId: dto.tenantId,
      email: dto.email,
      role: 'OWNER',
      moduleAccess: [{ module: 'accounting', canRead: true, canWrite: false }],
    });
  });
});
