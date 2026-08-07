'use client';

import { activityLogApi } from '@/lib/activityLog';
import type { TeamMember } from '@/lib/team';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useState } from 'react';

function formatChanges(changes: Record<string, { from: unknown; to: unknown }> | null): string {
  if (!changes) return '—';
  return Object.entries(changes)
    .map(([field, { from, to }]) => `${field}: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
    .join(', ');
}

/** Mismo esqueleto de slide-over que CartDrawer.tsx (backdrop + panel
 * anclado a la derecha) - consume GET /activity-log?userId=, que ya
 * soportaba este filtro desde antes de este feature, así que no hay
 * endpoint nuevo del lado del backend. */
export default function UserActivityDrawer({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['team-member-activity', member.id, page],
    queryFn: () => activityLogApi.getTenant({ page, pageSize, userId: member.id }),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Actividad</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{member.name ?? member.email}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading || !data ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : data.items.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay actividad registrada para este usuario.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.items.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs"
                >
                  <div className="flex items-center justify-between text-slate-500">
                    <span>{new Date(entry.occurredAt).toLocaleString('es-AR')}</span>
                    <span className={entry.outcome === 'FAILURE' ? 'text-red-500' : 'text-slate-400'}>
                      {entry.outcome === 'FAILURE' ? 'Falló' : 'OK'}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-800 dark:text-slate-200">
                    {entry.entityTypeLabel ?? 'Actividad'}
                    {entry.entityLabel ? ` · ${entry.entityLabel}` : ''}
                  </p>
                  {entry.changes && (
                    <p className="mt-1 break-all font-mono text-slate-500">{formatChanges(entry.changes)}</p>
                  )}
                  {entry.errorMessage && <p className="mt-1 text-red-500">{entry.errorMessage}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {data && (
          <div className="flex items-center gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">Página {page}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={data.items.length < pageSize}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
