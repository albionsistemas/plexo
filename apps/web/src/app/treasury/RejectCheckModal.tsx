'use client';

import { treasuryApi, type Check } from '@/lib/treasury';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  check: Check;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function RejectCheckModal({ check, onClose }: Props) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      treasuryApi.rejectCheck(check.id, { reason, feeAmount: feeAmount ? Number(feeAmount) : undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo rechazar el cheque';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('El motivo es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Rechazar cheque</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {check.bankName} · Nº {check.number} · ${check.amount}
        </p>
        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
          Reabre el saldo pendiente de la factura que este cheque había cancelado.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Motivo</label>
            <input
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Sin fondos, firma no coincide..."
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Gasto de rechazo (opcional)</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
            />
          </div>
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
              disabled={mutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
