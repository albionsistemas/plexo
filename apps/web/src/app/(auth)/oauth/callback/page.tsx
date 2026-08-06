'use client';

import { AuthCard } from '@/components/auth/AuthCard';
import { oauthChooseTenant, type TenantCandidate } from '@/lib/auth';
import { getPostLoginRedirect } from '@/lib/jwt';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function OAuthCallbackContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  const token = searchParams.get('token');
  const resolutionToken = searchParams.get('resolutionToken');
  const candidatesParam = searchParams.get('candidates');
  const oauthSignupToken = searchParams.get('oauthSignupToken');

  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
      queryClient.clear();
      router.replace(getPostLoginRedirect(token));
      return;
    }
    if (oauthSignupToken) {
      router.replace(`/oauth/complete-signup?oauthSignupToken=${encodeURIComponent(oauthSignupToken)}`);
    }
    // resolutionToken case is handled by the render below (needs a click),
    // and the "nothing at all" case falls through to the error render.
  }, [token, oauthSignupToken, router, queryClient]);

  async function pickTenant(tenantId: string) {
    if (!resolutionToken) return;
    setPicking(true);
    setError('');
    try {
      const { accessToken } = await oauthChooseTenant({ resolutionToken, tenantId });
      localStorage.setItem('token', accessToken);
      queryClient.clear();
      router.replace(getPostLoginRedirect(accessToken));
    } catch {
      setError('No pudimos completar el ingreso. Volvé a intentar desde el login.');
      setPicking(false);
    }
  }

  if (resolutionToken && candidatesParam) {
    let candidates: TenantCandidate[] = [];
    try {
      candidates = JSON.parse(candidatesParam);
    } catch {
      candidates = [];
    }

    return (
      <AuthCard title="Elegí tu empresa" subtitle="Esta cuenta de Google/Microsoft pertenece a más de una empresa">
        <div className="flex flex-col gap-3">
          {candidates.map((c) => (
            <button
              key={c.tenantId}
              onClick={() => pickTenant(c.tenantId)}
              disabled={picking}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition disabled:opacity-50"
            >
              {c.tenantName}
            </button>
          ))}
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </AuthCard>
    );
  }

  if (token || oauthSignupToken) {
    return (
      <AuthCard title="Ingresando...">
        <p className="text-sm text-slate-600 dark:text-slate-400">Un momento, te estamos redirigiendo.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Algo salió mal">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        No pudimos completar el ingreso con ese proveedor. Volvé a intentar desde el login.
      </p>
    </AuthCard>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
