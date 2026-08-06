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

interface OAuthProviderButtonProps {
  href: string;
  enabled: boolean;
  icon: React.ReactNode;
  label: string;
}

function OAuthProviderButton({ href, enabled, icon, label }: OAuthProviderButtonProps) {
  const className =
    'flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-medium transition';

  if (!enabled) {
    return (
      <span
        title="Próximamente"
        aria-disabled
        className={`${className} cursor-not-allowed text-slate-400 dark:text-slate-600 opacity-60`}
      >
        {icon}
        {label}
      </span>
    );
  }

  return (
    // Full <a> navigation on purpose, not a fetch/onClick - this has to be
    // a real top-level browser redirect into the OAuth provider's own
    // consent screen (see OAuthController.googleAuth/microsoftAuth).
    <a
      href={href}
      className={`${className} text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800`}
    >
      {icon}
      {label}
    </a>
  );
}

/** Rendered on both /login and /signup. Reads GET /auth/oauth/providers so
 * a button is only clickable when the API actually has credentials for
 * that provider (see OAuthConfigService) - otherwise it's visibly disabled
 * with a "Próximamente" tooltip instead of leading to a dead click. */
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
