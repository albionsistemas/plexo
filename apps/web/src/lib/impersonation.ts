import type { QueryClient } from '@tanstack/react-query';

const ADMIN_TOKEN_KEY = 'adminToken';
const TOKEN_KEY = 'token';
const TENANT_ID_KEY = 'tenantId';
const EXPIRES_AT_KEY = 'impersonationExpiresAt';

interface RouterLike {
  push: (href: string) => void;
}

export function isImpersonating(): boolean {
  return typeof window !== 'undefined' && !!localStorage.getItem(ADMIN_TOKEN_KEY);
}

/** Called from /admin's tenant table after POST /admin/tenants/:id/impersonate
 * succeeds. Stashes the SuperAdmin's own token under a separate key (so
 * "Salir" can restore it) before overwriting `token` - the only key api.ts
 * actually reads - with the short-lived impersonation token. queryClient.clear()
 * matches the same fix already applied at login: without it, cached queries
 * from the admin's own session would flash before the impersonated tenant's
 * data loads. */
export function startImpersonation(
  queryClient: QueryClient,
  router: RouterLike,
  tenantId: string,
  accessToken: string,
  expiresAt: string,
): void {
  const currentToken = localStorage.getItem(TOKEN_KEY);
  if (currentToken) {
    localStorage.setItem(ADMIN_TOKEN_KEY, currentToken);
  }
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(TENANT_ID_KEY, tenantId);
  localStorage.setItem(EXPIRES_AT_KEY, expiresAt);
  queryClient.clear();
  router.push('/dashboard');
}

/** Restores the SuperAdmin's own token and returns to /admin - used by both
 * ImpersonationBanner's "Salir" button and api.ts's 401 response
 * interceptor (impersonation token expired, see that file). */
export function endImpersonation(queryClient: QueryClient, router: RouterLike): void {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (adminToken) {
    localStorage.setItem(TOKEN_KEY, adminToken);
  }
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  queryClient.clear();
  router.push('/admin');
}

/** Decodes the CURRENT (impersonation) token's email, same no-signature-check
 * pattern AppShell.currentUserId() already uses client-side - this is only
 * for display in the banner, never a trust boundary. */
export function impersonatedEmail(): string | null {
  if (!isImpersonating()) return null;
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return (JSON.parse(atob(payload)) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}
