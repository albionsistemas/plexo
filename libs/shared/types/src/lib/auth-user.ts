export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALES'
  | 'INVENTORY'
  | 'ACCOUNTANT'
  | 'VIEWER';

export interface ModuleAccessClaim {
  module: string;
  canRead: boolean;
  canWrite: boolean;
}

/**
 * Shape of the JWT payload / `request.user`, once the auth module verifies
 * the token. moduleAccess is only populated for restricted roles (e.g.
 * ACCOUNTANT) — OWNER/ADMIN bypass it entirely, see ModuleAccessGuard.
 */
export interface AuthenticatedUser {
  sub: string;
  tenantId: string;
  email: string;
  role: UserRole;
  moduleAccess: ModuleAccessClaim[];
  // True for a user invited with a temporary password (see
  // UsersService.inviteUser) who hasn't changed it yet - MustChangePasswordGuard
  // blocks everything except the routes marked @AllowWhenPasswordChangeRequired().
  mustChangePassword: boolean;
  // Only present on a short-lived impersonation token (see
  // AuthService.impersonate) - purely informational, no guard reads this.
  // The frontend uses it to know whose identity is "really" behind the
  // active session (see ImpersonationBanner).
  impersonatedBy?: { id: string; email: string };
}
