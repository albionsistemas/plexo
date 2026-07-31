'use client';

import {
  ARGENTINE_JURISDICTION_LABELS,
  WITHHOLDING_TAX_TYPE_LABELS,
  withholdingRegimesApi,
  type ArgentineJurisdiction,
  type WithholdingTaxType,
} from '@/lib/taxes';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const TAX_TYPE_OPTIONS: WithholdingTaxType[] = ['INCOME_TAX', 'VAT', 'GROSS_INCOME'];
const JURISDICTION_OPTIONS = Object.keys(ARGENTINE_JURISDICTION_LABELS) as ArgentineJurisdiction[];

export default function NewWithholdingRegimeModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [taxType, setTaxType] = useState<WithholdingTaxType>('INCOME_TAX');
  const [jurisdiction, setJurisdiction] = useState<ArgentineJurisdiction | ''>('');
  const [rate, setRate] = useState('');
  const [minTaxableAmount, setMinTaxableAmount] = useState('');
  const [managedByAccountant, setManagedByAccountant] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      withholdingRegimesApi.create({
        code,
        name,
        taxType,
        jurisdiction: taxType === 'GROSS_INCOME' && jurisdiction ? jurisdiction : undefined,
        rate: Number(rate),
        minTaxableAmount: minTaxableAmount ? Number(minTaxableAmount) : undefined,
        managedByAccountant,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['withholding-regimes'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el régimen';
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
    if (!rate.trim()) {
      setError('La tasa es obligatoria');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nuevo régimen de retención</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Código</label>
            <input
              className={inputClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="GANANCIAS_RG830"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Nombre</label>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Retención Ganancias RG 830"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">Impuesto</label>
            <select
              className={inputClass}
              value={taxType}
              onChange={(e) => setTaxType(e.target.value as WithholdingTaxType)}
            >
              {TAX_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {WITHHOLDING_TAX_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {taxType === 'GROSS_INCOME' && (
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
            <label className="text-sm text-slate-600 dark:text-slate-400">Tasa (%)</label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="2"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-400">
              Mínimo no imponible (opcional, 0 = siempre retiene)
            </label>
            <input
              className={inputClass}
              type="number"
              step="0.01"
              value={minTaxableAmount}
              onChange={(e) => setMinTaxableAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={managedByAccountant}
              onChange={(e) => setManagedByAccountant(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800"
            />
            Delegado al contador (puede revisar la tasa sin ser OWNER/ADMIN)
          </label>
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
              {mutation.isPending ? 'Creando...' : 'Crear régimen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
