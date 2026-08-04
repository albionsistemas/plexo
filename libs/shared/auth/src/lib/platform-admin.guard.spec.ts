import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard.js';

function makeContext(user?: { email: string }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const originalEnv = process.env['PLATFORM_ADMIN_EMAILS'];

  afterEach(() => {
    process.env['PLATFORM_ADMIN_EMAILS'] = originalEnv;
  });

  it('throws when there is no authenticated user', () => {
    process.env['PLATFORM_ADMIN_EMAILS'] = 'owner@plexo.com';
    const guard = new PlatformAdminGuard();
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('throws when the user email is not in the allowlist', () => {
    process.env['PLATFORM_ADMIN_EMAILS'] = 'owner@plexo.com';
    const guard = new PlatformAdminGuard();
    expect(() => guard.canActivate(makeContext({ email: 'someone-else@demo.plexo' }))).toThrow(
      ForbiddenException,
    );
  });

  it('throws when the env var is unset', () => {
    delete process.env['PLATFORM_ADMIN_EMAILS'];
    const guard = new PlatformAdminGuard();
    expect(() => guard.canActivate(makeContext({ email: 'owner@plexo.com' }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows when the user email is in the allowlist, case-insensitively', () => {
    process.env['PLATFORM_ADMIN_EMAILS'] = 'Owner@Plexo.com, otro@plexo.com';
    const guard = new PlatformAdminGuard();
    expect(guard.canActivate(makeContext({ email: 'owner@plexo.com' }))).toBe(true);
  });
});
