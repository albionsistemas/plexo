'use client';

import { describeQuoteStatus, quotesApi, type QuoteDetail as QuoteDetailType } from '@/lib/quotes';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import QuoteDetailPanel from './QuoteDetailPanel';
import QuoteFormModal from './QuoteFormModal';

export default function CotizacionesTab() {
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuoteDetailType | null>(null);

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: () => quotesApi.list(),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Nueva cotización
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : !quotes || quotes.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no hay cotizaciones</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                <th className="p-3">Número</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => {
                const { label, colorClass } = describeQuoteStatus(q);
                return (
                  <tr key={q.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="p-3 font-mono text-xs text-slate-700 dark:text-slate-300">{q.number}</td>
                    <td className="p-3 text-slate-800 dark:text-slate-200">{q.customer.name}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">
                      {new Date(q.createdAt).toLocaleDateString('es-AR')}
                    </td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${colorClass}`}>{label}</span>
                    </td>
                    <td className="p-3 text-right text-slate-800 dark:text-slate-200">
                      ${Number(q.total).toFixed(2)} {q.currency.code}
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-3 text-xs">
                        <button
                          onClick={() => setDetailId(q.id)}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating && <QuoteFormModal onClose={() => setCreating(false)} />}
      {editing && <QuoteFormModal quote={editing} onClose={() => setEditing(null)} />}
      {detailId && (
        <QuoteDetailPanel
          quoteId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(detail) => {
            setDetailId(null);
            setEditing(detail);
          }}
        />
      )}
    </div>
  );
}
