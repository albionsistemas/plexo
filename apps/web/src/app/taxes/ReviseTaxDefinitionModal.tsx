'use client';

import { taxesApi, type TaxDefinition } from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  definition: TaxDefinition;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

export default function ReviseTaxDefinitionModal({ definition, onClose }: Props) {
  const queryClient = useQueryClient();
  const [rate, setRate] = useState(definition.rate ?? '');
  const [fixedAmount, setFixedAmount] = useState(definition.fixedAmount ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      taxesApi.reviseTaxDefinition({
        code: definition.code,
        rate: definition.calculationType === 'PERCENTAGE' && rate ? Number(rate) : undefined,
        fixedAmount:
          definition.calculationType === 'FIXED_AMOUNT' && fixedAmount ? Number(fixedAmount) : undefined,
        effectiveFrom: effectiveFrom || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tax-definitions'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo revisar el impuesto';
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
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">
            Revisar {definition.code} — {definition.name}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Cierra la vigencia actual en la fecha de efecto y crea una nueva versión — las facturas ya
          emitidas mantienen el valor que tenían cuando se calcularon.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {definition.calculationType === 'PERCENTAGE' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-400">Nueva tasa (%)</label>
              <input
                className={inputClass}
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          )}
          {definition.calculationType === 'FIXED_AMOUNT' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-400">Nuevo monto fijo</label>
              <input
                className={inputClass}
                type="number"
                step="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Vigente desde (opcional, por defecto ahora)</label>
            <input
              className={inputClass}
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
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
              {mutation.isPending ? 'Guardando...' : 'Guardar revisión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
