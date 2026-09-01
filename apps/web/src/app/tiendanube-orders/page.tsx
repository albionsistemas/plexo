'use client';

import { getSocket } from '@/lib/socket';
import { tiendanubeApi, type TiendanubeCatalogSyncResult } from '@/lib/tiendanube';
import { describeTiendanubeOrderStatus, tiendanubeOrdersApi, unmappedSkus, type TiendanubeOrder } from '@/lib/tiendanubeOrders';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';
import ConvertOrderModal from './ConvertOrderModal';

/**
 * Fase 2 cont. (bandeja de revisión) + Fase 5 (panel de sincronización) de
 * PLAN_TIENDANUBE.md, en la misma pantalla - conectar/desconectar la tienda
 * sigue viviendo en Preferencias (tarjeta de Tiendanube), no acá. Reusa el
 * patrón de tabla ya usado en Cartera de Cheques
 * (apps/web/src/app/treasury/page.tsx) para la bandeja, sin componente de
 * listado nuevo.
 */
export default function TiendanubeOrdersPage() {
  const [converting, setConverting] = useState<TiendanubeOrder | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);
  const [syncResult, setSyncResult] = useState<TiendanubeCatalogSyncResult | null>(null);
  const [syncError, setSyncError] = useState('');
  const queryClient = useQueryClient();

  const ordersQuery = useQuery({ queryKey: ['tiendanube-orders'], queryFn: tiendanubeOrdersApi.list });
  const orders = ordersQuery.data ?? [];
  const catalogStatusQuery = useQuery({ queryKey: ['tiendanube-catalog-status'], queryFn: tiendanubeApi.getCatalogStatus });
  const pendingWithUnmappedSkus = orders.filter(
    (order) => order.status === 'PENDING_REVIEW' && unmappedSkus(order).length > 0,
  ).length;

  // Vive fuera de React Query a propósito - no es un dato que se "pida",
  // es un evento en vivo (ver TiendanubeCatalogSyncService.syncAllPublished
  // y TiendanubeWebhookService.importOrder en el backend) relayado por el
  // mismo gateway de WebSocket que ya usan invoice.created/invoice.paid.
  useEffect(() => {
    const socket = getSocket();
    socket.on('tiendanube.catalog-sync-progress', (event: { done: number; total: number }) => {
      setSyncProgress({ done: event.done, total: event.total });
    });
    socket.on('tiendanube.order-received', () => {
      void queryClient.invalidateQueries({ queryKey: ['tiendanube-orders'] });
    });
    return () => {
      socket.off('tiendanube.catalog-sync-progress');
      socket.off('tiendanube.order-received');
    };
  }, [queryClient]);

  const syncMutation = useMutation({
    mutationFn: tiendanubeApi.syncCatalog,
    onMutate: () => {
      setSyncResult(null);
      setSyncError('');
      setSyncProgress(null);
    },
    onSuccess: (result) => {
      setSyncResult(result);
      setSyncProgress(null);
      void queryClient.invalidateQueries({ queryKey: ['tiendanube-catalog-status'] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo sincronizar el catálogo';
      setSyncError(Array.isArray(message) ? message.join(', ') : message);
      setSyncProgress(null);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tiendanube</h1>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Catálogo</p>
            <p className="text-xs text-slate-500">
              {catalogStatusQuery.data
                ? `${catalogStatusQuery.data.syncedCount} de ${catalogStatusQuery.data.publishedCount} artículos publicados sincronizados`
                : 'Cargando...'}
              {pendingWithUnmappedSkus > 0 &&
                ` · ${pendingWithUnmappedSkus} orden(es) en revisión con SKU sin mapear`}
            </p>
          </div>
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar catálogo ahora'}
          </button>
        </div>

        {syncMutation.isPending && (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: syncProgress ? `${Math.round((syncProgress.done / syncProgress.total) * 100)}%` : '5%' }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {syncProgress ? `Sincronizando ${syncProgress.done} de ${syncProgress.total}...` : 'Iniciando...'}
            </p>
          </div>
        )}

        {syncError && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{syncError}</p>}

        {syncResult && (
          <div className="mt-3 text-xs">
            <p className="text-slate-600 dark:text-slate-400">
              {syncResult.synced} de {syncResult.total} artículo(s) sincronizado(s).
            </p>
            {syncResult.skipped.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-amber-600 dark:text-amber-400">
                {syncResult.skipped.map((skip) => (
                  <li key={skip.articleId}>
                    {skip.name}: {skip.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {ordersQuery.isLoading ? (
          <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no llegó ninguna orden de Tiendanube.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Fecha</th>
                <th className="pb-2 pr-4">Orden</th>
                <th className="pb-2 pr-4">Cliente</th>
                <th className="pb-2 pr-4 text-right">Total</th>
                <th className="pb-2 pr-4">Estado</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const badge = describeTiendanubeOrderStatus(order.status);
                const skusToFix = unmappedSkus(order);
                const canConvert = order.status === 'PENDING_REVIEW';

                return (
                  <tr key={order.id} className="border-b border-slate-200/50 dark:border-slate-800/50 align-top">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {new Date(order.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">
                      #{order.tiendanubeOrderNumber ?? order.tiendanubeOrderId}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{order.customer.name}</td>
                    <td className="py-2 pr-4 text-right font-medium text-slate-900 dark:text-slate-100">
                      {order.currency} {order.total}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.colorClass}`}>
                        {badge.label}
                      </span>
                      {skusToFix.length > 0 && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          SKU sin mapear: {skusToFix.join(', ')}
                        </p>
                      )}
                      {order.status === 'CONVERTED' && order.convertedInvoiceId && (
                        <p className="mt-1 text-xs text-slate-500">Factura {order.convertedInvoiceId}</p>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {canConvert && (
                        <button
                          onClick={() => setConverting(order)}
                          disabled={skusToFix.length > 0}
                          title={
                            skusToFix.length > 0
                              ? `Falta mapear ${skusToFix.join(', ')} antes de poder convertir`
                              : undefined
                          }
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300 disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-600"
                        >
                          Convertir
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {converting && <ConvertOrderModal order={converting} onClose={() => setConverting(null)} />}
    </div>
  );
}
