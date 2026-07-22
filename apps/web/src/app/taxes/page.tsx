'use client';

import { taxesApi, type TaxCalculationType, type TaxDefinition } from '@/lib/taxes';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewTaxDefinitionModal from './NewTaxDefinitionModal';
import ReviseTaxDefinitionModal from './ReviseTaxDefinitionModal';

const CALC_TYPE_LABELS: Record<TaxCalculationType, string> = {
  PERCENTAGE: 'Porcentual',
  FIXED_AMOUNT: 'Monto fijo',
  FORMULA: 'Fórmula',
};

function formatValue(def: TaxDefinition): string {
  if (def.calculationType === 'PERCENTAGE') return def.rate ? `${def.rate}%` : '—';
  if (def.calculationType === 'FIXED_AMOUNT') return def.fixedAmount ? `$${def.fixedAmount}` : '—';
  return def.formula ?? '—';
}

export default function TaxesPage() {
  const [newOpen, setNewOpen] = useState(false);
  const [revising, setRevising] = useState<TaxDefinition | null>(null);

  const { data: definitions, isLoading, error } = useQuery({
    queryKey: ['tax-definitions'],
    queryFn: taxesApi.listTaxDefinitions,
  });

  const sorted = [...(definitions ?? [])].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime();
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Impuestos</h1>
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nuevo impuesto
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar los impuestos
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin impuestos definidos</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Código</th>
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2 pr-4">Valor</th>
                <th className="pb-2 pr-4">Vigencia</th>
                <th className="pb-2 pr-4">Contador</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((def) => {
                const active = def.validTo === null;
                return (
                  <tr key={def.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{def.code}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{def.name}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{CALC_TYPE_LABELS[def.calculationType]}</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{formatValue(def)}</td>
                    <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-400">
                      {new Date(def.validFrom).toLocaleDateString('es-AR')} —{' '}
                      {active ? (
                        <span className="text-emerald-600 dark:text-emerald-400">vigente</span>
                      ) : (
                        new Date(def.validTo as string).toLocaleDateString('es-AR')
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-400">
                      {def.managedByAccountant ? 'Delegado' : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {active && (
                        <button
                          onClick={() => setRevising(def)}
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {newOpen && <NewTaxDefinitionModal onClose={() => setNewOpen(false)} />}
      {revising && <ReviseTaxDefinitionModal definition={revising} onClose={() => setRevising(null)} />}
    </div>
  );
}
