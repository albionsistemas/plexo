'use client';

import { endImpersonation, impersonatedEmail } from '@/lib/impersonation';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Mounted in AppShell alongside TrialBanner, but visually louder (red, not
 * indigo) and rendered first - impersonation is an active platform-operator
 * action on someone else's data, it should never be mistaken for a routine
 * trial notice. Stays visible for as long as `adminToken` exists in
 * localStorage (see lib/impersonation.ts), which is exactly as long as an
 * impersonation session is active. */
export default function ImpersonationBanner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [email] = useState(() => impersonatedEmail());

  if (!email) {
    return null;
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-red-600 px-4 py-2 text-center text-xs font-semibold text-white">
      <span>
        ⚠ Estás impersonando a <span className="underline">{email}</span> — todo lo que hagas queda a nombre de
        este usuario.
      </span>
      <button
        onClick={() => endImpersonation(queryClient, router)}
        className="rounded bg-white/20 px-2 py-0.5 transition hover:bg-white/30"
      >
        Salir
      </button>
    </div>
  );
}
