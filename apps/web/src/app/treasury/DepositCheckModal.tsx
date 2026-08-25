'use client';

import type { FinancialAccount } from '@/lib/reports';
import { treasuryApi, type Check } from '@/lib/treasury';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  check: Check;
  accounts: FinancialAccount[];
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function DepositCheckModal({ check, accounts, onClose }: Props) {
  const queryClient = useQueryClient();
  const [financialAccountId, setFinancialAccountId] = useState(accounts[0]?.id ?? '');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => treasuryApi.depositCheck(check.id, financialAccountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['checks'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo depositar el cheque';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!financialAccountId) {
      setError('Elegí la cuenta donde se deposita');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Depositar cheque</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          {check.bankName} · Nº {check.number} · ${check.amount}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Cuenta de destino</label>
            {accounts.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                No hay cuentas financieras creadas todavía (Reportes → Financiero).
              </p>
            ) : (
              <select
                className={inputClass}
                value={financialAccountId}
                onChange={(e) => setFinancialAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
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
              disabled={mutation.isPending || accounts.length === 0}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Depositando...' : 'Depositar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
