'use client';

import { buildVariantLabel } from '@/lib/inventory';
import { quoteRequestsApi, type PurchaseOrderDetail } from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  rfqGroupId: string;
  onClose: () => void;
  onWinnerSelected: (purchaseOrder: PurchaseOrderDetail) => void;
}

/** Slide-over panel (same translate-x pattern as PurchaseOrderDetailPanel)
 * pivoting every QuoteRequest in a group into one row per article, one
 * column per supplier - see QuoteRequestService.compareGroup. Wider than
 * the usual max-w-lg panel (max-w-4xl) since it's a comparison table, not a
 * document detail. */
export default function QuoteRequestComparisonPanel({ rfqGroupId, onClose, onWinnerSelected }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['quote-request-comparison', rfqGroupId],
    queryFn: () => quoteRequestsApi.compareGroup(rfqGroupId),
  });

  const selectWinnerMutation = useMutation({
    mutationFn: (winningQuoteRequestId: string) =>
      quoteRequestsApi.selectWinner(rfqGroupId, winningQuoteRequestId),
    onSuccess: (purchaseOrder) => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onWinnerSelected(purchaseOrder);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo elegir este proveedor';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const cheapestByRow = new Map<string, number>();
  if (data) {
    for (const row of data.rows) {
      const costs = row.quotes.map((q) => (q.unitCost != null ? Number(q.unitCost) : null));
      const min = costs.reduce<number | null>((acc, c) => (c != null && (acc == null || c < acc) ? c : acc), null);
      if (min != null) cheapestByRow.set(row.articleVariantId, min);
    }
  }

  const anyWinnerAlreadyChosen = data?.suppliers.some((s) => s.status === 'CONVERTED') ?? false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-4xl flex-col overflow-y-auto border-l border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Comparar cotizaciones
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                    <th className="p-3">Artículo</th>
                    {data.suppliers.map((s) => (
                      <th key={s.quoteRequestId} className="p-3 text-right">
                        {s.supplier.name}
                        {s.status === 'CANCELLED' && (
                          <span className="ml-1 text-xs text-slate-400">(descartado)</span>
                        )}
                        {s.status === 'CONVERTED' && (
                          <span className="ml-1 text-xs text-green-600 dark:text-green-400">(ganador)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.articleVariantId} className="border-b border-slate-200/50 dark:border-slate-800/50">
                      <td className="p-3 text-slate-800 dark:text-slate-200">
                        {row.articleVariant.sku} — {row.articleVariant.article.name}
                        {buildVariantLabel(row.articleVariant) && (
                          <span className="text-slate-500"> · {buildVariantLabel(row.articleVariant)}</span>
                        )}
                      </td>
                      {row.quotes.map((q) => {
                        const cost = q.unitCost != null ? Number(q.unitCost) : null;
                        const isCheapest =
                          cost != null && cheapestByRow.get(row.articleVariantId) === cost;
                        return (
                          <td
                            key={q.quoteRequestId}
                            className={`p-3 text-right ${
                              isCheapest
                                ? 'bg-green-50 dark:bg-green-950/40 font-semibold text-green-700 dark:text-green-400'
                                : 'text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {cost != null ? `$${cost.toFixed(2)}` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-semibold">
                    <td className="p-3 text-slate-900 dark:text-slate-100">Total estimado</td>
                    {data.suppliers.map((s) => (
                      <td key={s.quoteRequestId} className="p-3 text-right text-slate-900 dark:text-slate-100">
                        {s.estimatedTotal != null ? `$${Number(s.estimatedTotal).toFixed(2)}` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3" />
                    {data.suppliers.map((s) => (
                      <td key={s.quoteRequestId} className="p-3 text-right">
                        {s.status === 'DRAFT' && !anyWinnerAlreadyChosen ? (
                          <button
                            onClick={() => selectWinnerMutation.mutate(s.quoteRequestId)}
                            disabled={selectWinnerMutation.isPending}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                          >
                            Elegir este proveedor
                          </button>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <p className="text-xs text-slate-500">
              Al elegir un proveedor se emite su Orden de Compra y el resto de los pedidos de este
              grupo se cancela automáticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
