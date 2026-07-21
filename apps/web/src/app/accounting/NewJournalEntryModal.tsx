'use client';

import { accountingApi, type JournalLineDirection } from '@/lib/accounting';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

interface LineForm {
  accountId: string;
  direction: JournalLineDirection;
  amount: string;
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

export default function NewJournalEntryModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: accountingApi.listAccounts,
  });
  const accounts = accountsQuery.data ?? [];

  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<LineForm[]>([
    { accountId: '', direction: 'DEBIT', amount: '' },
    { accountId: '', direction: 'CREDIT', amount: '' },
  ]);
  const [error, setError] = useState('');

  const debitTotal = lines
    .filter((l) => l.direction === 'DEBIT')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const creditTotal = lines
    .filter((l) => l.direction === 'CREDIT')
    .reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const isBalanced = lines.length >= 2 && debitTotal > 0 && debitTotal === creditTotal;

  const mutation = useMutation({
    mutationFn: () =>
      accountingApi.postJournalEntry({
        description,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          direction: l.direction,
          amount: Number(l.amount),
        })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounting-journal-entries'] });
      void queryClient.invalidateQueries({ queryKey: ['accounting-trial-balance'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo postear el asiento';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { accountId: '', direction: 'DEBIT', amount: '' }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!description.trim()) {
      setError('La descripción es obligatoria');
      return;
    }
    if (lines.some((l) => !l.accountId || !l.amount || Number(l.amount) <= 0)) {
      setError('Cada línea necesita cuenta e importe mayor a cero');
      return;
    }
    if (!isBalanced) {
      setError(`El asiento no balancea: débitos $${debitTotal.toFixed(2)} vs créditos $${creditTotal.toFixed(2)}`);
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Nuevo asiento manual</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Descripción</label>
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ajuste de caja..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-400">Líneas</label>
              <button
                type="button"
                onClick={addLine}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                + agregar línea
              </button>
            </div>
            {lines.map((line, index) => (
              <div key={index} className="flex items-center gap-2">
                <select
                  className={`${inputClass} flex-1`}
                  value={line.accountId}
                  onChange={(e) => updateLine(index, { accountId: e.target.value })}
                >
                  <option value="">Cuenta...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} — {acc.name}
                    </option>
                  ))}
                </select>
                <select
                  className={inputClass}
                  value={line.direction}
                  onChange={(e) =>
                    updateLine(index, { direction: e.target.value as JournalLineDirection })
                  }
                >
                  <option value="DEBIT">Debe</option>
                  <option value="CREDIT">Haber</option>
                </select>
                <input
                  type="number"
                  step="any"
                  className={`${inputClass} w-28`}
                  value={line.amount}
                  onChange={(e) => updateLine(index, { amount: e.target.value })}
                  placeholder="0.00"
                />
                {lines.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="text-slate-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div
            className={`rounded-lg border p-3 text-sm ${
              isBalanced
                ? 'border-green-800 bg-green-950 text-green-300'
                : 'border-slate-700 bg-slate-800 text-slate-400'
            }`}
          >
            Debe: ${debitTotal.toFixed(2)} · Haber: ${creditTotal.toFixed(2)}
            {isBalanced ? ' · Balanceado ✓' : ''}
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
              disabled={mutation.isPending || !isBalanced}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Posteando...' : 'Postear asiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

