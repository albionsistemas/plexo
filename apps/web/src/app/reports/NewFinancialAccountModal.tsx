'use client';

import { reportsApi, type FinancialAccountProvider } from '@/lib/reports';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

const PROVIDER_OPTIONS: { value: FinancialAccountProvider; label: string }[] = [
  { value: 'BANK', label: 'Banco' },
  { value: 'MERCADOPAGO', label: 'MercadoPago' },
  { value: 'PAYPAL', label: 'PayPal' },
  { value: 'CASH', label: 'Efectivo' },
];

export default function NewFinancialAccountModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [provider, setProvider] = useState<FinancialAccountProvider>('BANK');
  const [currentBalance, setCurrentBalance] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      reportsApi.createFinancialAccount({
        name,
        provider,
        currentBalance: currentBalance ? Number(currentBalance) : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['financial-accounts'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la cuenta';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Nueva cuenta financiera</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Nombre</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cuenta corriente Banco Nación"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Proveedor</label>
            <select
              className={inputClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value as FinancialAccountProvider)}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Saldo inicial (opcional)</label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={currentBalance}
              onChange={(e) => setCurrentBalance(e.target.value)}
              placeholder="0.00"
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
              {mutation.isPending ? 'Creando...' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
