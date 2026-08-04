'use client';

import { subscriptionsApi } from '@/lib/subscriptions';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

function daysRemaining(trialEndsAt: string): number {
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Persistente en toda la app (ver AppShell) - sólo se muestra mientras la
 * suscripción está TRIALING, nunca para ACTIVE/PAST_DUE/EXPIRED (EXPIRED ya
 * bloquea la acción real desde el backend, no hace falta un banner aparte
 * para eso todavía). */
export default function TrialBanner() {
  const { data: subscription, isError } = useQuery({
    queryKey: ['subscription-me'],
    queryFn: subscriptionsApi.getCurrent,
  });

  // isError explicitly checked (not just "!subscription"): react-query
  // keeps the last successful `data` around on a failed refetch (e.g. this
  // route 403s while mustChangePassword is still true, or any other
  // tenant's account was open in this same tab moments ago) - without this
  // check, a failed fetch would keep showing whatever the previous
  // successful one returned instead of hiding the banner.
  if (!subscription || isError || subscription.status !== 'TRIALING' || !subscription.trialEndsAt) {
    return null;
  }

  const days = daysRemaining(subscription.trialEndsAt);

  return (
    <div className="flex items-center justify-center gap-2 bg-indigo-600 px-4 py-1.5 text-center text-xs font-medium text-white">
      <span>
        Te quedan {days} día{days === 1 ? '' : 's'} de tu prueba gratuita del Plan {subscription.plan.name}.
      </span>
      <Link href="/settings/billing" className="underline hover:no-underline">
        Ver planes
      </Link>
    </div>
  );
}
