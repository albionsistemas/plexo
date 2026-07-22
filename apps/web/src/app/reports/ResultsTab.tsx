'use client';

import { reportsApi, type AccountType } from '@/lib/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import DateRangeFilter from './DateRangeFilter';
import { currentMonthRange } from './dateRange';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

export default function ResultsTab() {
  const [{ from, to }, setRange] = useState(currentMonthRange());

  const revenueQuery = useQuery({
    queryKey: ['reports-revenue-summary', from, to],
    queryFn: () => reportsApi.getRevenueSummary({ from, to }),
  });
  const incomeStatementQuery = useQuery({
    queryKey: ['reports-income-statement', from, to],
    queryFn: () => reportsApi.getIncomeStatement({ from, to }),
  });

  const summary = revenueQuery.data;
  const statement = incomeStatementQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={(value) => setRange((r) => ({ ...r, from: value }))}
        onToChange={(value) => setRange((r) => ({ ...r, to: value }))}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Facturas emitidas</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{summary?.invoiceCount ?? '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Subtotal</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            ${summary ? Number(summary.subtotal).toFixed(2) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">IVA</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            ${summary ? Number(summary.taxTotal).toFixed(2) : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500">Total facturado</p>
          <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            ${summary ? Number(summary.total).toFixed(2) : '—'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Estado de resultados (libro mayor)</h2>
        {incomeStatementQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : incomeStatementQuery.error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar el estado de resultados
          </div>
        ) : statement?.lines.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">
            Sin asientos de ingresos/gastos en el período — este informe se llena a medida que se
            postean asientos contables (automático al facturar).
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Código</th>
                  <th className="pb-2 pr-4">Cuenta</th>
                  <th className="pb-2 pr-4">Tipo</th>
                  <th className="pb-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {statement?.lines.map((line) => (
                  <tr key={line.accountId} className="border-b border-slate-200/50 dark:border-slate-800/50">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{line.code}</td>
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{line.name}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{TYPE_LABELS[line.type]}</td>
                    <td className="py-2 text-right text-slate-700 dark:text-slate-300">${Number(line.amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex flex-col gap-1 border-t border-slate-200 dark:border-slate-800 pt-3 text-sm">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Ingresos totales</span>
                <span>${statement ? Number(statement.totalRevenue).toFixed(2) : '0.00'}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Gastos totales</span>
                <span>${statement ? Number(statement.totalExpenses).toFixed(2) : '0.00'}</span>
              </div>
              <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-100">
                <span>Resultado neto</span>
                <span>${statement ? Number(statement.netIncome).toFixed(2) : '0.00'}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
