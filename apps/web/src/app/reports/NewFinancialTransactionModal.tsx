'use client';

import { reportsApi } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  financialAccountId: string;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

export default function NewFinancialTransactionModal({ financialAccountId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.recordFinancialTransaction({
        financialAccountId,
        amount: Number(amount),
        occurredAt: occurredAt || undefined,
        externalRef: externalRef || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled', financialAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation', financialAccountId] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo registrar el movimiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) === 0) {
      setError('El importe es obligatorio y no puede ser cero');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Nuevo movimiento</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Importe positivo para un ingreso, negativo para un egreso.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Importe</label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000 o -500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Fecha (opcional, por defecto ahora)</label>
            <input
              className={inputClass}
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Referencia externa (opcional)</label>
            <input
              className={inputClass}
              value={externalRef}
              onChange={(e) => setExternalRef(e.target.value)}
              placeholder="N° de comprobante bancario"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando...' : 'Registrar movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
