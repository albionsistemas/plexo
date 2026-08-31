'use client';

import { describeTiendanubeOrderStatus, tiendanubeOrdersApi, unmappedSkus, type TiendanubeOrder } from '@/lib/tiendanubeOrders';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import ConvertOrderModal from './ConvertOrderModal';

/**
 * Bandeja MÍNIMA de revisión (Fase 2 cont., pieza 3) - lista, badge de
 * estado, motivo, y el botón de conversión. Reusa el patrón de tabla ya
 * usado en Cartera de Cheques (apps/web/src/app/treasury/page.tsx), no
 * introduce ningún componente nuevo de listado.
 *
 * Lo que NO es esto (queda para el panel completo de Fase 5 de
 * PLAN_TIENDANUBE.md, sin construir todavía): estado de sincronización de
 * catálogo/stock, progreso de sincronización masiva, conectar/desconectar
 * la tienda (eso vive en Preferencias, tarjeta de Tiendanube), ni filtros
 * de fecha/búsqueda - sólo la lista completa, más reciente primero.
 */
export default function TiendanubeOrdersPage() {
  const [converting, setConverting] = useState<TiendanubeOrder | null>(null);

  const ordersQuery = useQuery({ queryKey: ['tiendanube-orders'], queryFn: tiendanubeOrdersApi.list });
  const orders = ordersQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Órdenes de Tiendanube</h1>

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
