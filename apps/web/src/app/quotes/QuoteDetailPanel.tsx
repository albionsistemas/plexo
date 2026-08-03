'use client';

import {
  describeQuoteStatus,
  PDF_STYLES,
  quotePreferencesApi,
  quotesApi,
  type PdfStyle,
  type QuoteDetail,
} from '@/lib/quotes';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';
import QuoteFollowUpModal from './QuoteFollowUpModal';

interface Props {
  quoteId: string;
  onClose: () => void;
  onEdit: (detail: QuoteDetail) => void;
}

export default function QuoteDetailPanel({ quoteId, onClose, onEdit }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const { data: preferences } = useQuery({
    queryKey: ['quote-preferences'],
    queryFn: quotePreferencesApi.get,
  });
  const [styleTouched, setStyleTouched] = useState(false);
  useEffect(() => {
    if (!styleTouched && preferences) setPdfStyle(preferences.quotePdfStyle);
  }, [preferences, styleTouched]);

  const { data, isLoading } = useQuery({
    queryKey: ['quote-detail', quoteId],
    queryFn: () => quotesApi.get(quoteId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['quotes'] });
    void queryClient.invalidateQueries({ queryKey: ['quote-detail', quoteId] });
  }

  function onMutationError(fallback: string) {
    return (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? fallback;
      setError(Array.isArray(message) ? message.join(', ') : message);
    };
  }

  const cancelMutation = useMutation({
    mutationFn: () => quotesApi.cancel(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo cancelar la cotización'),
  });
  const acceptMutation = useMutation({
    mutationFn: () => quotesApi.accept(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo marcar como aceptada'),
  });
  const rejectMutation = useMutation({
    mutationFn: () => quotesApi.reject(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo marcar como rechazada'),
  });
  const sendEmailMutation = useMutation({
    mutationFn: () => quotesApi.sendEmail(quoteId),
    onSuccess: invalidate,
    onError: onMutationError('No se pudo enviar por email'),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div
        className={`flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl transition-transform duration-200 ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{data?.number ?? '...'}</h2>
            {data && <p className="text-xs text-slate-500">{data.customer.name}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        {isLoading || !data ? (
          <div className="flex h-40 items-center justify-center text-slate-500">Cargando...</div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Estado">
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${describeQuoteStatus(data).colorClass}`}>
                  {describeQuoteStatus(data).label}
                </span>
              </Info>
              <Info label="Fecha">{new Date(data.createdAt).toLocaleDateString('es-AR')}</Info>
              {data.validUntil && (
                <Info label="Válida hasta">{new Date(data.validUntil).toLocaleDateString('es-AR')}</Info>
              )}
              {data.sentAt && (
                <Info label="Enviada">
                  {new Date(data.sentAt).toLocaleDateString('es-AR')} ({data.sentVia === 'EMAIL' ? 'Email' : 'WhatsApp'})
                </Info>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Líneas</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Precio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lines.map((line) => (
                      <tr key={line.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                        <td className="p-2">
                          <p className="text-slate-800 dark:text-slate-200">{line.articleVariant.article.name}</p>
                          <p className="font-mono text-[10px] text-slate-500">{line.articleVariant.sku}</p>
                        </td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">{line.quantity}</td>
                        <td className="p-2 text-right text-slate-700 dark:text-slate-300">
                          ${Number(line.unitPrice).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                Total: ${Number(data.total).toFixed(2)} {data.currency.code}
              </p>
            </section>

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Notas</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">{data.notes}</p>
              </section>
            )}

            <section className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-2 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                  value={pdfStyle}
                  onChange={(e) => {
                    setPdfStyle(e.target.value as PdfStyle);
                    setStyleTouched(true);
                  }}
                >
                  {PDF_STYLES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void quotesApi.openPdf(quoteId, pdfStyle)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  Descargar PDF
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {data.status === 'DRAFT' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(data)}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setSending(true)}
                      className="rounded-lg border border-indigo-300 dark:border-indigo-700 px-3 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 transition hover:bg-indigo-50 dark:hover:bg-indigo-950"
                    >
                      Enviar...
                    </button>
                    <button
                      type="button"
                      onClick={() => sendEmailMutation.mutate()}
                      disabled={sendEmailMutation.isPending || !data.customer.email}
                      title={!data.customer.email ? 'El cliente no tiene email cargado' : undefined}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {sendEmailMutation.isPending ? 'Enviando...' : 'Enviar por email'}
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </>
                )}
                {data.status === 'SENT' && (
                  <>
                    <button
                      type="button"
                      onClick={() => acceptMutation.mutate()}
                      disabled={acceptMutation.isPending}
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-500 disabled:opacity-50"
                    >
                      Marcar aceptada
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMutation.mutate()}
                      disabled={rejectMutation.isPending}
                      className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                    >
                      Marcar rechazada
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </section>
          </div>
        )}
      </div>

      {sending && data && <QuoteFollowUpModal quote={data} onClose={() => setSending(false)} />}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 dark:text-slate-200">{children}</p>
    </div>
  );
}
