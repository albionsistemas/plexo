import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '@plexo/database';
import type { AuthService } from '../auth.service.js';
import type { TenantProvisioningService } from '../tenant-provisioning.service.js';
import { OAuthService } from './oauth.service.js';
import type { OAuthValidatedProfile } from './oauth.types.js';

const profile: OAuthValidatedProfile = {
  provider: 'GOOGLE',
  providerAccountId: 'google-sub-123',
  email: 'nuevo@demo.com',
  name: 'Nuevo Usuario',
};

function makePrisma(queryRawResults: unknown[][], fakeTx: Record<string, unknown> = {}) {
  const txWithExecuteRaw = { $executeRaw: jest.fn().mockResolvedValue(undefined), ...fakeTx };
  const queryRaw = jest.fn();
  queryRawResults.forEach((result) => queryRaw.mockResolvedValueOnce(result));
  return {
    $queryRaw: queryRaw,
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(txWithExecuteRaw)),
  } as unknown as PrismaService;
}

function makeJwt() {
  return {
    signAsync: jest.fn().mockImplementation((payload) => Promise.resolve(`signed:${JSON.stringify(payload)}`)),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;
}

function makeAuthService() {
  return { buildAccessToken: jest.fn().mockResolvedValue('signed.jwt.token') } as unknown as AuthService;
}

function makeTenantProvisioningService() {
  return {
    provision: jest.fn().mockResolvedValue({ tenantId: 'tenant-new', userId: 'user-new' }),
  } as unknown as TenantProvisioningService;
}

describe('OAuthService.handleOAuthLogin', () => {
  it('logs in directly when the OAuth account is already linked', async () => {
    const fakeTx = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' }) },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = makePrisma([[{ tenant_id: 'tenant-1', user_id: 'user-1' }]], fakeTx);
    const authService = makeAuthService();
    const service = new OAuthService(prisma, makeJwt(), authService, makeTenantProvisioningService());

    const result = await service.handleOAuthLogin(profile);

    expect(result).toEqual({ kind: 'login', accessToken: 'signed.jwt.token' });
    expect(authService.buildAccessToken).toHaveBeenCalled();
  });

  it('auto-links and logs in when exactly one tenant matches the verified email', async () => {
    const fakeTx = {
      oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', emailVerifiedAt: null }),
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' }),
      },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = makePrisma(
      [[], [{ tenant_id: 'tenant-1', user_id: 'user-1', tenant_name: 'Acme' }]],
      fakeTx,
    );
    const authService = makeAuthService();
    const service = new OAuthService(prisma, makeJwt(), authService, makeTenantProvisioningService());

    const result = await service.handleOAuthLogin(profile);

    expect(fakeTx.oAuthAccount.create).toHaveBeenCalledWith({
      data: { tenantId: 'tenant-1', userId: 'user-1', provider: 'GOOGLE', providerAccountId: 'google-sub-123', email: profile.email },
    });
    expect(fakeTx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerifiedAt: expect.any(Date) },
    });
    expect(result).toEqual({ kind: 'login', accessToken: 'signed.jwt.token' });
  });

  it('does not touch emailVerifiedAt when the matched account is already verified', async () => {
    const fakeTx = {
      oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', emailVerifiedAt: new Date('2026-01-01') }),
        update: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' }),
      },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = makePrisma(
      [[], [{ tenant_id: 'tenant-1', user_id: 'user-1', tenant_name: 'Acme' }]],
      fakeTx,
    );
    const service = new OAuthService(prisma, makeJwt(), makeAuthService(), makeTenantProvisioningService());

    await service.handleOAuthLogin(profile);

    expect(fakeTx.user.update).not.toHaveBeenCalled();
  });

  it('returns choose-tenant when the email matches 2+ tenants', async () => {
    const prisma = makePrisma([
      [],
      [
        { tenant_id: 'tenant-1', user_id: 'user-1', tenant_name: 'Acme' },
        { tenant_id: 'tenant-2', user_id: 'user-2', tenant_name: 'Beta' },
      ],
    ]);
    const jwt = makeJwt();
    const service = new OAuthService(prisma, jwt, makeAuthService(), makeTenantProvisioningService());

    const result = await service.handleOAuthLogin(profile);

    expect(result.kind).toBe('choose-tenant');
    if (result.kind === 'choose-tenant') {
      expect(result.candidates).toEqual([
        { tenantId: 'tenant-1', tenantName: 'Acme' },
        { tenantId: 'tenant-2', tenantName: 'Beta' },
      ]);
    }
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'oauth-choose-tenant', email: profile.email }),
      { expiresIn: '10m' },
    );
  });

  it('returns a signup token when no tenant matches at all', async () => {
    const prisma = makePrisma([[], []]);
    const jwt = makeJwt();
    const service = new OAuthService(prisma, jwt, makeAuthService(), makeTenantProvisioningService());

    const result = await service.handleOAuthLogin(profile);

    expect(result.kind).toBe('signup');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'oauth-signup', email: profile.email }),
      { expiresIn: '10m' },
    );
  });
});

describe('OAuthService.chooseTenant', () => {
  it('links and logs in when the chosen tenant is a real candidate for that email', async () => {
    const fakeTx = {
      oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-2', emailVerifiedAt: new Date() }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-2', tenantId: 'tenant-2' }),
      },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = makePrisma(
      [[{ tenant_id: 'tenant-2', user_id: 'user-2', tenant_name: 'Beta' }]],
      fakeTx,
    );
    const jwt = makeJwt();
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ kind: 'oauth-choose-tenant', ...profile });
    const authService = makeAuthService();
    const service = new OAuthService(prisma, jwt, authService, makeTenantProvisioningService());

    const result = await service.chooseTenant({ resolutionToken: 'tok', tenantId: 'tenant-2' });

    expect(fakeTx.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-2', userId: 'user-2' }) }),
    );
    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });

  it('rejects a tenantId that is not among the real candidates for that email', async () => {
    const prisma = makePrisma([[{ tenant_id: 'tenant-2', user_id: 'user-2', tenant_name: 'Beta' }]]);
    const jwt = makeJwt();
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ kind: 'oauth-choose-tenant', ...profile });
    const service = new OAuthService(prisma, jwt, makeAuthService(), makeTenantProvisioningService());

    await expect(service.chooseTenant({ resolutionToken: 'tok', tenantId: 'tenant-forged' })).rejects.toThrow();
  });

  it('rejects an expired or invalid resolution token', async () => {
    const prisma = makePrisma([]);
    const jwt = makeJwt();
    (jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error('jwt expired'));
    const service = new OAuthService(prisma, jwt, makeAuthService(), makeTenantProvisioningService());

    await expect(service.chooseTenant({ resolutionToken: 'expired', tenantId: 'tenant-2' })).rejects.toThrow();
  });
});

describe('OAuthService.completeSignup', () => {
  it('provisions a new tenant auto-verified, links the OAuth account, and logs in', async () => {
    const fakeTx = {
      oAuthAccount: { create: jest.fn().mockResolvedValue({}) },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'user-new', tenantId: 'tenant-new' }) },
      userModuleAccess: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const prisma = makePrisma([], fakeTx);
    const jwt = makeJwt();
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ kind: 'oauth-signup', ...profile });
    const tenantProvisioningService = makeTenantProvisioningService();
    const service = new OAuthService(prisma, jwt, makeAuthService(), tenantProvisioningService);

    const result = await service.completeSignup({ oauthSignupToken: 'tok', tenantName: 'Nueva SRL' });

    expect(tenantProvisioningService.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nueva SRL',
        ownerEmail: profile.email,
        ownerName: profile.name,
        autoVerifyEmail: true,
      }),
    );
    // El tenantId real lo genera completeSignup() con randomUUID() (mismo
    // patrón que SignupService.signup) - no es el 'tenant-new' que el mock
    // de provision() devuelve, sólo userId sale de ahí.
    expect(fakeTx.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: expect.any(String), userId: 'user-new' }) }),
    );
    expect(result).toEqual({ accessToken: 'signed.jwt.token' });
  });
});
