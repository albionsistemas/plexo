/**
 * Extracted from PlatformAdminGuard so AuthService can reuse the exact same
 * allowlist parsing when stamping isPlatformAdmin onto a freshly issued JWT
 * (see buildAccessToken) - the guard remains the actual enforcement point,
 * this is only ever used to decide "should the frontend offer /admin",
 * never to grant access on its own.
 */
export function isPlatformAdminEmail(email: string): boolean {
  const allowedEmails = (process.env['PLATFORM_ADMIN_EMAILS'] ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowedEmails.includes(email.toLowerCase());
}
