// Decodes the payload of a JWT this app itself just received from a trusted
// response (login/verify-email/oauth callback) - not a verification step
// (the browser has no way to check the signature meaningfully; the API
// already did that). Only used to read claims for UI decisions like the
// post-login redirect, never to authorize anything - every real permission
// check still happens server-side per request.
export interface DecodedAuthToken {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  isPlatformAdmin?: boolean;
}

export function decodeToken(token: string): DecodedAuthToken | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof window !== 'undefined' ? window.atob(base64) : Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json) as DecodedAuthToken;
  } catch {
    return null;
  }
}

// SuperAdmin isn't a role, it's an email allowlist (see isPlatformAdminEmail
// server-side) - the token just carries the precomputed flag so the
// frontend doesn't need a second round-trip right after login.
export function getPostLoginRedirect(token: string): string {
  const decoded = decodeToken(token);
  return decoded?.isPlatformAdmin ? '/admin' : '/dashboard';
}
