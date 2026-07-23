import type { TenantSettingsView } from './tenant-settings.service.js';

/**
 * The one place the safe-fallback rule lives: returns the tenant's custom
 * "from" only when CUSTOM_DOMAIN is selected AND Resend has actually
 * verified the domain AND both from-parts are set. Anything else (SHARED
 * mode, or a domain still pending/failed verification) returns undefined,
 * meaning "let the caller's own default (the global EMAIL_FROM) apply" -
 * so a half-verified domain never breaks a send.
 */
export function resolveEmailFrom(settings: TenantSettingsView): string | undefined {
  if (
    settings.emailSenderMode !== 'CUSTOM_DOMAIN' ||
    settings.domainStatus !== 'verified' ||
    !settings.emailCustomDomain ||
    !settings.emailFromLocalPart
  ) {
    return undefined;
  }
  const address = `${settings.emailFromLocalPart}@${settings.emailCustomDomain}`;
  return settings.emailFromName ? `${settings.emailFromName} <${address}>` : address;
}
