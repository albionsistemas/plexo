'use client';

import {
  PDF_STYLES,
  purchasePreferencesApi,
  quoteRequestsApi,
  type PdfStyle,
  type PurchaseOrderDetail,
  type QuoteRequestDetail,
} from '@/lib/purchases';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

interface Props {
  quoteRequestId: string;
  onClose: () => void;
  onEdit: (detail: QuoteRequestDetail) => void;
  onConverted: (purchaseOrder: PurchaseOrderDetail) => void;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Borrador',
  CONVERTED: 'Emitido a Orden de Compra',
  CANCELLED: 'Cancelado',
  SENT: 'Enviada',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  CONVERTED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

export default function QuoteRequestDetailPanel({ quoteRequestId, onClose, onEdit, onConverted }: Props) {
  const queryClient = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [pdfStyle, setPdfStyle] = useState<PdfStyle>('MODERNO');
  const [error, setError] = useState('');

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Defaults the style picker to the user's own saved preference, without
  // fighting a manual change they make afterward in this same panel.
  const { data: preferences } = useQuery({
    queryKey: ['purchase-preferences'],
    queryFn: purchasePreferencesApi.get,
  });
  const [styleTouched, setStyleTouched] = useState(false);
  useEffect(() => {
    if (!styleTouched && preferences) setPdfStyle(preferences.purchaseDocumentPdfStyle);
  }, [preferences, styleTouched]);

  const { data, isLoading } = useQuery({
    queryKey: ['quote-request-detail', quoteRequestId],
    queryFn: () => quoteRequestsApi.get(quoteRequestId),
  });

  const cloneMutation = useMutation({
    mutationFn: () => quoteRequestsApi.clone(quoteRequestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      onClose();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => quoteRequestsApi.cancel(quoteRequestId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['quote-request-detail', quoteRequestId] });
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => quoteRequestsApi.convert(quoteRequestId),
    onSuccess: (purchaseOrder) => {
      void queryClient.invalidateQueries({ queryKey: ['quote-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      onConverted(purchaseOrder);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo emitir la orden de compra';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
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
            {data && <p className="text-xs text-slate-500">{data.supplier.name}</p>}
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
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[data.status]}`}>
                  {STATUS_LABELS[data.status] ?? data.status}
                </span>
              </Info>
              <Info label="Fecha">{new Date(data.createdAt).toLocaleDateString('es-AR')}</Info>
              {data.validUntil && (
                <Info label="Válido hasta">{new Date(data.validUntil).toLocaleDateString('es-AR')}</Info>
              )}
              {data.transportMode && <Info label="Transporte">{data.transportMode.name}</Info>}
              {data.paymentTerm && <Info label="Forma de pago">{data.paymentTerm.name}</Info>}
              {data.deliveryTime && <Info label="Plazo de entrega">{data.deliveryTime.name}</Info>}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Líneas</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-left text-slate-500">
                      <th className="p-2">Artículo</th>
                      <th className="p-2 text-right">Cant.</th>
                      <th className="p-2 text-right">Costo est.</th>
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
                          {line.estimatedUnitCost != null ? `$${Number(line.estimatedUnitCost).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-right text-sm font-semibold text-slate-900 dark:text-slate-100">
                Total estimado: {data.estimatedTotal != null ? `$${Number(data.estimatedTotal).toFixed(2)}` : 'incompleto'}
              </p>
            </section>

            {data.notes && (
              <section>
                <h3 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">Notas</h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">{data.notes}</p>
              </section>
            )}

            {data.purchaseOrders.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-medium text-slate-600 dark:text-slate-400">Órdenes de Compra</h3>
                <ul className="flex flex-col gap-1 text-sm text-slate-700 dark:text-slate-300">
                  {data.purchaseOrders.map((po) => (
                    <li key={po.id}>{po.number} — {STATUS_LABELS[po.status] ?? po.status}</li>
                  ))}
                </ul>
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
                  onClick={() => void quoteRequestsApi.openPdf(quoteRequestId, pdfStyle)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  Descargar PDF
                </button>
                <button
                  type="button"
                  onClick={() => cloneMutation.mutate()}
                  disabled={cloneMutation.isPending}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {cloneMutation.isPending ? 'Clonando...' : 'Clonar'}
                </button>
              </div>

              {data.status === 'DRAFT' && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(data)}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                    className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
                  >
                    Cancelar pedido
                  </button>
                  <button
                    type="button"
                    onClick={() => convertMutation.mutate()}
                    disabled={convertMutation.isPending}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {convertMutation.isPending ? 'Emitiendo...' : 'Emitir Orden de Compra'}
                  </button>
                </div>
              )}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </section>
          </div>
        )}
      </div>
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
