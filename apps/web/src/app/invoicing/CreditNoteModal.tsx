'use client';

import { invoicingApi, type Invoice } from '@/lib/invoicing';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Props {
  invoice: Invoice;
  onClose: () => void;
}

const inputClass =
  'w-24 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function CreditNoteModal({ invoice, onClose }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  // Quantity to credit per invoice line, keyed by InvoiceLine.id. Defaults
  // to the full sold quantity of each line - leaving every input untouched
  // and submitting reproduces the old "full reversal" behavior in one call.
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    queryKey: ['invoice-detail', invoice.id],
    queryFn: () => invoicingApi.getInvoice(invoice.id),
  });
  const tenantSettingsQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });
  const afipConfigured = tenantSettingsQuery.data?.afipConfigured ?? false;

  useEffect(() => {
    if (detailQuery.data) {
      setQuantities(
        Object.fromEntries(detailQuery.data.lines.map((line) => [line.id, line.quantity])),
      );
    }
  }, [detailQuery.data]);

  const mutation = useMutation({
    mutationFn: (lines: { invoiceLineId: string; quantity: number }[]) =>
      invoicingApi.createCreditNote({ invoiceId: invoice.id, reason, lines }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['invoice-detail', invoice.id] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo emitir la nota de crédito';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('Indicá un motivo');
      return;
    }
    const lines = Object.entries(quantities)
      .map(([invoiceLineId, quantity]) => ({ invoiceLineId, quantity: Number(quantity) }))
      .filter((l) => l.quantity > 0);
    if (lines.length === 0) {
      setError('Ingresá una cantidad a devolver en al menos una línea');
      return;
    }
    mutation.mutate(lines);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nota de crédito</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Acreditá {invoice.documentLetter}-{invoice.number}: elegí cuánto devolver de cada línea. Dejar
          todas las cantidades como están acredita la factura completa.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {detailQuery.isLoading && <p className="text-sm text-slate-500">Cargando líneas...</p>}
          {detailQuery.data && (
            <div className="flex flex-col gap-2">
              {detailQuery.data.lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2"
                >
                  <div className="text-sm text-slate-900 dark:text-slate-100">
                    <div>{line.articleVariant.article.name}</div>
                    <div className="text-xs text-slate-500">
                      {line.articleVariant.sku} — vendidas: {line.quantity}
                    </div>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max={line.quantity}
                    className={inputClass}
                    value={quantities[line.id] ?? ''}
                    onChange={(e) =>
                      setQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Motivo</label>
            <textarea
              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Devolución de mercadería..."
            />
          </div>
          {!afipConfigured && (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Todavía no configuraste el certificado AFIP de esta empresa - la nota de crédito no va
              a poder pedir CAE hasta que lo cargues en{' '}
              <Link href="/preferences" className="font-medium underline">
                Preferencias → Certificado AFIP
              </Link>
              .
            </p>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || detailQuery.isLoading || !afipConfigured}
              title={!afipConfigured ? 'Configurá el certificado AFIP en Preferencias primero' : undefined}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600 disabled:opacity-50"
            >
              {mutation.isPending ? 'Emitiendo...' : 'Emitir nota de crédito'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
