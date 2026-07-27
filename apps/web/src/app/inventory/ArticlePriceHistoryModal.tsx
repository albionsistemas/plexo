'use client';

import { inventoryApi } from '@/lib/inventory';
import { useQuery } from '@tanstack/react-query';

interface Props {
  variant: { id: string; sku: string; articleName: string };
  onClose: () => void;
}

/** Read-only history of PriceHistory entries for one variant - each row is
 * a costed movement (PURCHASE_IN/PRODUCTION_IN), optionally tied to the
 * Orden de Compra that sourced it. */
export default function ArticlePriceHistoryModal({ variant, onClose }: Props) {
  const historyQuery = useQuery({
    queryKey: ['price-history', variant.id],
    queryFn: () => inventoryApi.getPriceHistory(variant.id),
  });
  const entries = historyQuery.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Historial de precios</h2>
            <p className="text-xs text-slate-500">
              {variant.articleName} · <span className="font-mono">{variant.sku}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {historyQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : entries.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-slate-400 dark:text-slate-600">
            Sin registros de precio todavía
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Fecha</th>
                  <th className="pb-2 pr-4 text-right">Precio venta</th>
                  <th className="pb-2 pr-4 text-right">Costo</th>
                  <th className="pb-2">Comprobante</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {new Date(entry.effectiveAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-800 dark:text-slate-200">
                      ${Number(entry.unitPrice).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-400">
                      {entry.costPrice !== null ? `$${Number(entry.costPrice).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-2 text-slate-600 dark:text-slate-400">
                      {entry.purchaseOrderNumber ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
