'use client';

import { ARGENTINE_JURISDICTION_LABELS, withholdingRegimesApi, type ArgentineJurisdiction, type WithholdingRegime } from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  regime: WithholdingRegime;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const JURISDICTION_OPTIONS = Object.keys(ARGENTINE_JURISDICTION_LABELS) as ArgentineJurisdiction[];

export default function ReviseWithholdingRegimeModal({ regime, onClose }: Props) {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(regime.rate);
  const [jurisdiction, setJurisdiction] = useState<ArgentineJurisdiction | ''>(regime.jurisdiction ?? '');
  const [minTaxableAmount, setMinTaxableAmount] = useState(regime.minTaxableAmount);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      withholdingRegimesApi.revise({
        code: regime.code,
        rate: rate ? Number(rate) : undefined,
        jurisdiction: regime.taxType === 'GROSS_INCOME' && jurisdiction ? jurisdiction : undefined,
        minTaxableAmount: minTaxableAmount ? Number(minTaxableAmount) : undefined,
        effectiveFrom: effectiveFrom || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['withholding-regimes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo revisar el régimen';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Revisar {regime.code} — {regime.name}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Cierra la vigencia actual en la fecha de efecto y crea una nueva versión — los pagos ya
          registrados mantienen la retención que se calculó en su momento.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Nueva tasa (%)</label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          {regime.taxType === 'GROSS_INCOME' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-600 dark:text-slate-400">Jurisdicción</label>
              <select
                className={inputClass}
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as ArgentineJurisdiction)}
              >
                <option value="">Elegí una provincia...</option>
                {JURISDICTION_OPTIONS.map((j) => (
                  <option key={j} value={j}>
                    {ARGENTINE_JURISDICTION_LABELS[j]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Nuevo mínimo no imponible</label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={minTaxableAmount}
              onChange={(e) => setMinTaxableAmount(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">
              Vigente desde (opcional, por defecto ahora)
            </label>
            <input
              className={inputClass}
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
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
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar revisión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
