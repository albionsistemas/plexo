'use client';

import { taxesApi, type TaxCalculationType } from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

const CALC_TYPE_OPTIONS: { value: TaxCalculationType; label: string }[] = [
  { value: 'PERCENTAGE', label: 'Porcentual' },
  { value: 'FIXED_AMOUNT', label: 'Monto fijo' },
  { value: 'FORMULA', label: 'Fórmula' },
];

export default function NewTaxDefinitionModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [calculationType, setCalculationType] = useState<TaxCalculationType>('PERCENTAGE');
  const [rate, setRate] = useState('');
  const [fixedAmount, setFixedAmount] = useState('');
  const [formula, setFormula] = useState('');
  const [managedByAccountant, setManagedByAccountant] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      taxesApi.createTaxDefinition({
        code,
        name,
        calculationType,
        rate: calculationType === 'PERCENTAGE' && rate ? Number(rate) : undefined,
        fixedAmount: calculationType === 'FIXED_AMOUNT' && fixedAmount ? Number(fixedAmount) : undefined,
        formula: calculationType === 'FORMULA' ? formula : undefined,
        managedByAccountant,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tax-definitions'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el impuesto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!code.trim() || !name.trim()) {
      setError('Código y nombre son obligatorios');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">Nuevo impuesto</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Código</label>
            <input
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="IVA_21"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Nombre</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="IVA 21%"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Tipo de cálculo</label>
            <select
              className={inputClass}
              value={calculationType}
              onChange={(e) => setCalculationType(e.target.value as TaxCalculationType)}
            >
              {CALC_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {calculationType === 'PERCENTAGE' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-400">Tasa (%)</label>
              <input
                className={inputClass}
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="21"
              />
            </div>
          )}
          {calculationType === 'FIXED_AMOUNT' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-400">Monto fijo</label>
              <input
                className={inputClass}
                type="number"
                step="0.01"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="1500"
              />
            </div>
          )}
          {calculationType === 'FORMULA' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-400">Fórmula</label>
              <input
                className={inputClass}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                placeholder="ver documentación de fórmulas"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={managedByAccountant}
              onChange={(e) => setManagedByAccountant(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-800"
            />
            Delegado al contador (puede revisar la tasa sin ser OWNER/ADMIN)
          </label>
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
              {mutation.isPending ? 'Creando...' : 'Crear impuesto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
