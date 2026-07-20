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
}
