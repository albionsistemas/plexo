'use client';

import { API_BASE_URL } from '@/lib/api';
import { getOAuthProviders } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.89c2.28-2.1 3.56-5.2 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.89-3c-1.08.73-2.46 1.16-4.04 1.16-3.1 0-5.73-2.09-6.67-4.9H1.3v3.09A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.33 14.35a7.2 7.2 0 0 1 0-4.7V6.56H1.3a12 12 0 0 0 0 10.88l4.03-3.09Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.58 1.79l3.44-3.44C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.3 6.56l4.03 3.09C6.27 6.84 8.9 4.75 12 4.75Z"
      />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
      <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

// Monochrome, fill="currentColor" on purpose - it has to flip white-on-black
// / black-on-white with the button's own text color (see the "apple"
// variant below), same as Apple's own official button assets do between
// their "black"/"white" styles.
function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.393 2.163-1.176 3.08-.929 1.116-2.145 1.762-3.487 1.674-.14-1.098.339-2.246 1.09-3.08.85-.964 2.28-1.68 3.573-1.674zM20.943 17.036c-.464 1.06-.972 2.08-1.567 3.03-.813 1.31-1.782 2.75-3.099 2.762-1.267.014-1.674-.807-3.114-.807-1.44 0-1.897.79-3.087.822-1.31.038-2.316-1.42-3.13-2.73C4.87 17.34 3.66 12.5 5.24 9.234c.783-1.63 2.19-2.66 3.717-2.685 1.24-.024 2.41.833 3.166.833.755 0 2.178-1.03 3.674-.878.626.026 2.383.253 3.51 1.905-.09.056-2.095 1.224-2.075 3.646.023 2.897 2.542 3.86 2.57 3.872-.02.06-.402 1.386-1.33 2.75z" />
    </svg>
  );
}

interface OAuthProviderButtonProps {
  href: string;
  enabled: boolean;
  icon: React.ReactNode;
  label: string;
  /** 'neutral' (default) is the bordered, theme-following style used for
   * Google/Microsoft. 'apple' follows Apple's own Human Interface
   * Guidelines for "Sign in with Apple" instead of this app's usual
   * button styling - solid black on a light background, solid white on a
   * dark one (never bordered/neutral), same rule Apple's own button
   * assets follow. */
  variant?: 'neutral' | 'apple';
}

function OAuthProviderButton({ href, enabled, icon, label, variant = 'neutral' }: OAuthProviderButtonProps) {
  const base = 'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition';
  const variantClass =
    variant === 'apple'
      ? 'border border-black dark:border-white bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
      : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800';

  if (!enabled) {
    return (
      <span title="Próximamente" aria-disabled className={`${base} cursor-not-allowed opacity-40 ${variantClass}`}>
        {icon}
        {label}
      </span>
    );
  }

  return (
    // Full <a> navigation on purpose, not a fetch/onClick - this has to be
    // a real top-level browser redirect into the OAuth provider's own
    // consent screen (see OAuthController.googleAuth/microsoftAuth/appleAuth).
    <a href={href} className={`${base} ${variantClass}`}>
      {icon}
      {label}
    </a>
  );
}

/** Rendered on both /login and /signup. Reads GET /auth/oauth/providers so
 * a button is only clickable when the API actually has credentials for
 * that provider (see OAuthConfigService) - otherwise it's visibly disabled
 * with a "Próximamente" tooltip instead of leading to a dead click. Same
 * modular shape for all 3 providers (one OAuthProviderButton per provider,
 * stacked in a column) so this adapts to mobile without any extra layout
 * work - it's already a single flex column, not a grid that would need a
 * breakpoint. */
export function OAuthButtons() {
  const { data } = useQuery({
    queryKey: ['oauth-providers'],
    queryFn: getOAuthProviders,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="relative my-1 text-center text-xs text-slate-400 dark:text-slate-500">
        <span className="relative bg-white/90 dark:bg-slate-900/70 px-2">o continuá con</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-slate-200 dark:border-slate-800" />
      </div>
      <OAuthProviderButton
        href={`${API_BASE_URL}/auth/oauth/apple`}
        enabled={!!data?.apple}
        icon={<AppleIcon />}
        label="Continuar con Apple"
        variant="apple"
      />
      <OAuthProviderButton
        href={`${API_BASE_URL}/auth/oauth/google`}
        enabled={!!data?.google}
        icon={<GoogleIcon />}
        label="Continuar con Google"
      />
      <OAuthProviderButton
        href={`${API_BASE_URL}/auth/oauth/microsoft`}
        enabled={!!data?.microsoft}
        icon={<MicrosoftIcon />}
        label="Continuar con Microsoft"
      />
    </div>
  );
}
