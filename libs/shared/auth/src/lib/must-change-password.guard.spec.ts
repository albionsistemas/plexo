import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MustChangePasswordGuard } from './must-change-password.guard.js';

function makeContext(user?: { mustChangePassword: boolean }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function makeReflector(values: { isPublic?: boolean; allowed?: boolean }): Reflector {
  return {
    getAllAndOverride: jest
      .fn()
      .mockReturnValueOnce(values.isPublic)
      .mockReturnValueOnce(values.allowed),
  } as unknown as Reflector;
}

describe('MustChangePasswordGuard', () => {
  it('allows a @Public() route through without even looking at the user', () => {
    const guard = new MustChangePasswordGuard(makeReflector({ isPublic: true }));
    expect(guard.canActivate(makeContext(undefined))).toBe(true);
  });

  it('allows a route marked @AllowWhenPasswordChangeRequired()', () => {
    const guard = new MustChangePasswordGuard(makeReflector({ allowed: true }));
    expect(guard.canActivate(makeContext({ mustChangePassword: true }))).toBe(true);
  });

  it('allows a normal user through', () => {
    const guard = new MustChangePasswordGuard(makeReflector({}));
    expect(guard.canActivate(makeContext({ mustChangePassword: false }))).toBe(true);
  });

  it('blocks a user who still must change their password', () => {
    const guard = new MustChangePasswordGuard(makeReflector({}));
    expect(() => guard.canActivate(makeContext({ mustChangePassword: true }))).toThrow(
      ForbiddenException,
    );
  });
});
