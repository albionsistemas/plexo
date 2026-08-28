'use client';

import { invoicingApi, type Currency } from '@/lib/invoicing';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function errorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<{ message?: string | string[] }>;
  const message = axiosErr.response?.data?.message ?? fallback;
  return Array.isArray(message) ? message.join(', ') : message;
}

/** "Monedas y Cotizaciones" en Preferencias - cierra el círculo del motor
 * multi-moneda (Currency/ExchangeRateHistory ya existían y se usaban en
 * Facturación/Cotizaciones/Compras, pero nadie podía dar de alta una moneda
 * ni cargar su cotización desde la UI). El sync con Banco Nación en sí
 * (horario/on-off) es global de la plataforma, no de este tenant - eso vive
 * en Admin → Cotizaciones USD (superadmin), no acá. */
export default function CurrencySettings() {
  const queryClient = useQueryClient();
  const currenciesQuery = useQuery({
    queryKey: ['invoicing-currencies'],
    queryFn: invoicingApi.listCurrencies,
  });
  const currencies = currenciesQuery.data ?? [];
  const baseCurrency = currencies.find((c) => c.isBase);

  const [addingCurrency, setAddingCurrency] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [manualRateByCurrency, setManualRateByCurrency] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const invalidateCurrencies = () => queryClient.invalidateQueries({ queryKey: ['invoicing-currencies'] });

  const createCurrencyMutation = useMutation({
    mutationFn: () => invoicingApi.createCurrency({ code: newCode.trim().toUpperCase(), name: newName.trim() }),
    onSuccess: () => {
      setAddingCurrency(false);
      setNewCode('');
      setNewName('');
      setError('');
      void invalidateCurrencies();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo crear la moneda')),
  });

  const recordRateMutation = useMutation({
    mutationFn: ({ currencyId, rate }: { currencyId: string; rate: number }) =>
      invoicingApi.recordExchangeRate(currencyId, rate),
    onSuccess: () => {
      setError('');
      void invalidateCurrencies();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo guardar la cotización')),
  });

  const syncBnaMutation = useMutation({
    mutationFn: invoicingApi.syncBnaRate,
    onSuccess: () => {
      setError('');
      void invalidateCurrencies();
    },
    onError: (err) => setError(errorMessage(err, 'No se pudo sincronizar con Banco Nación')),
  });

  const historyQuery = useQuery({
    queryKey: ['exchange-rate-history', expandedHistoryId],
    queryFn: () => invoicingApi.getExchangeRateHistory(expandedHistoryId as string),
    enabled: !!expandedHistoryId,
  });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">Monedas y Cotizaciones</h2>
        <button
          type="button"
          onClick={() => setAddingCurrency((v) => !v)}
          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
        >
          + nueva moneda
        </button>
      </div>

      {currenciesQuery.isLoading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : (
        <>
          <p className="mb-4 text-xs text-slate-500">
            Moneda base:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {baseCurrency ? `${baseCurrency.code} — ${baseCurrency.name}` : '— sin configurar —'}
            </span>
          </p>

          {addingCurrency && (
            <div className="mb-4 flex items-end gap-2 rounded-lg border border-slate-300 dark:border-slate-700 p-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 dark:text-slate-400">Código (ISO)</span>
                <input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  maxLength={3}
                  placeholder="USD"
                  className={`${inputClass} w-20 uppercase`}
                />
              </label>
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-xs text-slate-600 dark:text-slate-400">Nombre</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Dólar estadounidense"
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                onClick={() => createCurrencyMutation.mutate()}
                disabled={newCode.trim().length !== 3 || !newName.trim() || createCurrencyMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {createCurrencyMutation.isPending ? 'Creando...' : 'Crear'}
              </button>
              <button
                type="button"
                onClick={() => setAddingCurrency(false)}
                className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          )}

          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="pb-2 pr-4">Código</th>
                  <th className="pb-2 pr-4">Nombre</th>
                  <th className="pb-2 pr-4">Cotización vigente</th>
                  <th className="pb-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((currency) => (
                  <CurrencyRow
                    key={currency.id}
                    currency={currency}
                    manualRate={manualRateByCurrency[currency.id] ?? ''}
                    onManualRateChange={(v) =>
                      setManualRateByCurrency((prev) => ({ ...prev, [currency.id]: v }))
                    }
                    onSaveManualRate={() => {
                      const rate = Number(manualRateByCurrency[currency.id]);
                      if (rate > 0) {
                        recordRateMutation.mutate({ currencyId: currency.id, rate });
                      }
                    }}
                    savingRate={recordRateMutation.isPending}
                    onSyncBna={() => syncBnaMutation.mutate()}
                    syncingBna={syncBnaMutation.isPending}
                    historyOpen={expandedHistoryId === currency.id}
                    onToggleHistory={() =>
                      setExpandedHistoryId((prev) => (prev === currency.id ? null : currency.id))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          {expandedHistoryId && (
            <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                Historial de cotizaciones
              </p>
              {historyQuery.isLoading ? (
                <p className="text-xs text-slate-500">Cargando...</p>
              ) : !historyQuery.data || historyQuery.data.length === 0 ? (
                <p className="text-xs text-slate-500">Todavía no hay cotizaciones cargadas.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="pb-1 pr-4">Fecha</th>
                      <th className="pb-1">Cotización</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyQuery.data.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-200 dark:border-slate-800">
                        <td className="py-1 pr-4">{new Date(entry.effectiveAt).toLocaleString('es-AR')}</td>
                        <td className="py-1">{entry.rate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CurrencyRow({
  currency,
  manualRate,
  onManualRateChange,
  onSaveManualRate,
  savingRate,
  onSyncBna,
  syncingBna,
  historyOpen,
  onToggleHistory,
}: {
  currency: Currency;
  manualRate: string;
  onManualRateChange: (v: string) => void;
  onSaveManualRate: () => void;
  savingRate: boolean;
  onSyncBna: () => void;
  syncingBna: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
}) {
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800">
      <td className="py-2 pr-4 font-medium text-slate-700 dark:text-slate-300">{currency.code}</td>
      <td className="py-2 pr-4">{currency.name}</td>
      <td className="py-2 pr-4">{currency.latestRate ?? '— sin cargar —'}</td>
      <td className="py-2">
        {currency.isBase ? (
          <span className="text-slate-500">Moneda base</span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {currency.code === 'USD' && (
              <button
                type="button"
                onClick={onSyncBna}
                disabled={syncingBna}
                className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {syncingBna ? 'Sincronizando...' : 'Sincronizar con Banco Nación'}
              </button>
            )}
            <input
              type="number"
              step="any"
              placeholder="Cotización manual"
              value={manualRate}
              onChange={(e) => onManualRateChange(e.target.value)}
              className={`${inputClass} w-32`}
            />
            <button
              type="button"
              onClick={onSaveManualRate}
              disabled={savingRate || !manualRate}
              className="rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={onToggleHistory}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
            >
              {historyOpen ? 'Ocultar historial' : 'Ver historial'}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
