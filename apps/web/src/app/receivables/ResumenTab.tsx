'use client';

import { receivablesApi } from '@/lib/receivables';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import StatementModal from './StatementModal';

export default function ResumenTab() {
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [statementFor, setStatementFor] = useState<string | null>(null);

  const agingQuery = useQuery({
    queryKey: ['receivables-aging'],
    queryFn: receivablesApi.getAgingReport,
  });
  const aging = agingQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">Antigüedad de saldos</h2>
        {agingQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : aging.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin saldos pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className={`${headY} pr-4`}>Cliente</th>
                  <th className={`${headY} pr-4 text-right`}>Al día</th>
                  <th className={`${headY} pr-4 text-right`}>1-30</th>
                  <th className={`${headY} pr-4 text-right`}>31-60</th>
                  <th className={`${headY} pr-4 text-right`}>61-90</th>
                  <th className={`${headY} pr-4 text-right`}>90+</th>
                  <th className={`${headY} pr-4 text-right`}>Total</th>
                </tr>
              </thead>
              <tbody>
                {aging.map((row) => (
                  <tr
                    key={row.customerId}
                    onClick={() => setStatementFor(row.customerId)}
                    className="cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
                  >
                    <td className={`${cellY} pr-4 text-slate-800 dark:text-slate-200`}>{row.customerName}</td>
                    <td className={`${cellY} pr-4 text-right text-slate-700 dark:text-slate-300`}>
                      ${Number(row.current).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-slate-700 dark:text-slate-300`}>
                      ${Number(row.days1to30).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-amber-600 dark:text-amber-400`}>
                      ${Number(row.days31to60).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-orange-400`}>
                      ${Number(row.days61to90).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right text-red-600 dark:text-red-400`}>
                      ${Number(row.days90Plus).toFixed(2)}
                    </td>
                    <td className={`${cellY} pr-4 text-right font-semibold text-slate-900 dark:text-slate-100`}>
                      ${Number(row.totalOutstanding).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {statementFor && (
        <StatementModal customerId={statementFor} onClose={() => setStatementFor(null)} />
      )}
    </div>
  );
}
