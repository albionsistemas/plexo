'use client';

import {
  ARGENTINE_JURISDICTION_LABELS,
  WITHHOLDING_TAX_TYPE_LABELS,
  withholdingRegimesApi,
  type WithholdingRegime,
} from '@/lib/taxes';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewWithholdingRegimeModal from './NewWithholdingRegimeModal';
import ReviseWithholdingRegimeModal from './ReviseWithholdingRegimeModal';

/** Mirrors TaxDefinitionsTab's table/modal shape exactly (same
 * versioning UX: "Revisar" closes the active row and opens a new one) -
 * see WithholdingRegimeService on the backend for why. */
export default function WithholdingRegimesTab() {
  const [newOpen, setNewOpen] = useState(false);
  const [revising, setRevising] = useState<WithholdingRegime | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: tenantSettingsApi.get,
  });
  const { data: regimes, isLoading, error } = useQuery({
    queryKey: ['withholding-regimes'],
    queryFn: withholdingRegimesApi.list,
  });

  const noAgentEnabled =
    settings != null &&
    !settings.withholdingAgentIncomeTax &&
    !settings.withholdingAgentVat &&
    !settings.withholdingAgentGrossIncome;

  const sorted = [...(regimes ?? [])].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    return new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime();
  });

  return (
    <div className="flex flex-col gap-4">
      {noAgentEnabled && (
        <p className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-3 text-xs text-amber-700 dark:text-amber-400">
          Todavía no marcaste ningún carácter de agente de retención en Preferencias — un régimen que
          crees acá no se va a poder aplicar hasta que lo hagas.
        </p>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nuevo régimen
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar los regímenes
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin regímenes de retención definidos</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Código</th>
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2 pr-4">Impuesto</th>
                <th className="pb-2 pr-4">Jurisdicción</th>
                <th className="pb-2 pr-4">Tasa</th>
                <th className="pb-2 pr-4">Mínimo no imponible</th>
                <th className="pb-2 pr-4">Vigencia</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((regime) => {
                const active = regime.validTo === null;
                return (
                  <tr key={regime.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{regime.code}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{regime.name}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {WITHHOLDING_TAX_TYPE_LABELS[regime.taxType]}
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {regime.jurisdiction ? ARGENTINE_JURISDICTION_LABELS[regime.jurisdiction] : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{regime.rate}%</td>
                    <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">${regime.minTaxableAmount}</td>
                    <td className="py-2 pr-4 text-xs text-slate-600 dark:text-slate-400">
                      {new Date(regime.validFrom).toLocaleDateString('es-AR')} —{' '}
                      {active ? (
                        <span className="text-emerald-600 dark:text-emerald-400">vigente</span>
                      ) : (
                        new Date(regime.validTo as string).toLocaleDateString('es-AR')
                      )}
                    </td>
                    <td className="py-2 text-right">
                      {active && (
                        <button
                          onClick={() => setRevising(regime)}
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

      {newOpen && <NewWithholdingRegimeModal onClose={() => setNewOpen(false)} />}
      {revising && <ReviseWithholdingRegimeModal regime={revising} onClose={() => setRevising(null)} />}
    </div>
  );
}
