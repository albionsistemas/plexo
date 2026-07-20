import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '@plexo/types';
import { JwtAuthGuard } from './jwt-auth.guard.js';

function makeContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(isPublic: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  it('allows public routes through without a token', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(true));
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('throws when there is no bearer token', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(false));
    await expect(guard.canActivate(makeContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws when the token fails verification', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(false));
    await expect(
      guard.canActivate(makeContext({ authorization: 'Bearer nope' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the decoded payload to request.user on a valid token', async () => {
    const payload: AuthenticatedUser = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      email: 'a@b.com',
      role: 'OWNER',
      moduleAccess: [],
    };
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue(payload),
    } as unknown as JwtService;
    const guard = new JwtAuthGuard(jwtService, makeReflector(false));

    const request: { headers: Record<string, string>; user?: AuthenticatedUser } = {
      headers: { authorization: 'Bearer good' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});
