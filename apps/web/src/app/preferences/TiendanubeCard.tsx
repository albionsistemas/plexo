'use client';

import { tiendanubeApi, type TiendanubeConnectorStatusResponse } from '@/lib/tiendanube';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function errorMessage(err: AxiosError<{ message?: string | string[] }>, fallback: string): string {
  const message = err.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

const STATUS_PILL: Record<TiendanubeConnectorStatusResponse['status'], string> = {
  DISCONNECTED: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  PENDING: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  CONNECTED: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
  EXPIRED: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  REVOKED: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
  ERROR: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400',
};

const STATUS_LABEL: Record<TiendanubeConnectorStatusResponse['status'], string> = {
  DISCONNECTED: 'No conectado',
  PENDING: 'Vinculación en curso',
  CONNECTED: 'Conectado',
  EXPIRED: 'Necesita reconexión (venció)',
  REVOKED: 'Necesita reconexión (desautorizado desde Tiendanube)',
  ERROR: 'Necesita reconexión',
};

/**
 * Mismo patrón exacto que MercadoPagoCard (mismo shape de connector,
 * mismas 4 rutas de backend) - sin su propio título "Integraciones": esa
 * sección ya la introduce MercadoPagoCard, esta card es sólo una fila más
 * en la misma grilla (ver preferences/page.tsx, MercadoPagoCard.tsx se
 * queda intacta, esta no la reemplaza ni la envuelve).
 */
export default function TiendanubeCard() {
  return (
    <Suspense fallback={<TiendanubeCardSkeleton />}>
      <TiendanubeCardInner />
    </Suspense>
  );
}

function TiendanubeCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
      <p className="text-xs text-slate-500">Cargando...</p>
    </div>
  );
}

function TiendanubeCardInner() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [error, setError] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['tiendanube-status'],
    queryFn: tiendanubeApi.getStatus,
  });

  // Vuelta del callback de OAuth (ver TiendanubeController.callback, que
  // redirige acá con ?connector=tiendanube&status=connected|error - sin
  // "denied", Tiendanube no distingue ese caso del resto de un error).
  const connectorParam = searchParams.get('connector');
  const statusParam = searchParams.get('status');
  useEffect(() => {
    if (connectorParam !== 'tiendanube') return;
    void queryClient.invalidateQueries({ queryKey: ['tiendanube-status'] });
    router.replace('/preferences');
  }, [connectorParam, statusParam, queryClient, router]);

  const connectMutation = useMutation({
    mutationFn: tiendanubeApi.authorize,
    onSuccess: ({ authorizationUrl }) => {
      window.location.href = authorizationUrl;
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo iniciar la vinculación con Tiendanube'));
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: tiendanubeApi.disconnect,
    onSuccess: () => {
      setConfirmingDisconnect(false);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['tiendanube-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setError(errorMessage(err, 'No se pudo desconectar Tiendanube'));
    },
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      {connectorParam === 'tiendanube' && statusParam === 'error' && (
        <p className="mb-4 text-xs text-red-600 dark:text-red-400">
          No se pudo completar la vinculación con Tiendanube. Probá de nuevo o revisá que hayas usado
          la cuenta correcta.
        </p>
      )}
      {connectorParam === 'tiendanube' && statusParam === 'connected' && (
        <p className="mb-4 text-xs text-green-600 dark:text-green-400">
          Tienda de Tiendanube vinculada correctamente.
        </p>
      )}

      <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-600 dark:text-emerald-400">
            TN
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Tiendanube</p>
            {isLoading ? (
              <p className="text-xs text-slate-500">Cargando...</p>
            ) : status ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[status.status]}`}>
                  {STATUS_LABEL[status.status]}
                </span>
                {status.status === 'CONNECTED' && status.storeName && (
                  <span className="text-xs text-slate-500">tienda "{status.storeName}"</span>
                )}
                {status.status === 'CONNECTED' && status.connectedAt && (
                  <span className="text-xs text-slate-500">
                    · desde el {new Date(status.connectedAt).toLocaleDateString('es-AR')}
                  </span>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status?.status === 'CONNECTED' ? (
            confirmingDisconnect ? (
              <>
                <button
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                >
                  {disconnectMutation.isPending ? 'Desconectando...' : 'Confirmar'}
                </button>
                <button
                  onClick={() => setConfirmingDisconnect(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingDisconnect(true)}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
              >
                Desconectar
              </button>
            )
          ) : (
            <button
              onClick={() => {
                setError('');
                connectMutation.mutate();
              }}
              disabled={connectMutation.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {connectMutation.isPending
                ? 'Redirigiendo...'
                : status?.status && ['EXPIRED', 'REVOKED', 'ERROR'].includes(status.status)
                  ? 'Reconectar Tiendanube'
                  : 'Conectar Tiendanube'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
