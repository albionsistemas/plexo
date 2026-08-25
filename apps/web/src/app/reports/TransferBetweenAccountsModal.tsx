'use client';

import { reportsApi, type FinancialAccount } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  accounts: FinancialAccount[];
  defaultFromId: string;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function TransferBetweenAccountsModal({ accounts, defaultFromId, onClose }: Props) {
  const queryClient = useQueryClient();
  const [fromId, setFromId] = useState(defaultFromId);
  const [toId, setToId] = useState(accounts.find((a) => a.id !== defaultFromId)?.id ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.transferBetweenAccounts({
        fromFinancialAccountId: fromId,
        toFinancialAccountId: toId,
        amount: Number(amount),
        note: note || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-unreconciled'] });
      void queryClient.invalidateQueries({ queryKey: ['financial-reconciliation'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo transferir entre cuentas';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (fromId === toId) {
      setError('La cuenta de origen y destino no pueden ser la misma');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('El importe debe ser mayor a cero');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Transferir entre cuentas</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Desde</label>
            <select className={inputClass} value={fromId} onChange={(e) => setFromId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Hacia</label>
            <select className={inputClass} value={toId} onChange={(e) => setToId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Importe</label>
            <input
              className={inputClass}
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Nota (opcional)</label>
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
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
              disabled={mutation.isPending || accounts.length < 2}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Transfiriendo...' : 'Transferir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
