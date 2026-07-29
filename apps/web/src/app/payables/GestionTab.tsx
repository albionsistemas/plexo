'use client';

import { payablesApi } from '@/lib/payables';
import { useDensity } from '@/providers/DensityProvider';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import SupplierStatementModal from './SupplierStatementModal';

export default function GestionTab() {
  const { density } = useDensity();
  const cellY = density === 'compact' ? 'py-1' : 'py-2';
  const headY = density === 'compact' ? 'pb-1' : 'pb-2';
  const [statementFor, setStatementFor] = useState<string | null>(null);

  const balancesQuery = useQuery({
    queryKey: ['payables-balances'],
    queryFn: payablesApi.listSupplierBalances,
  });
  const balances = balancesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-slate-500">
        {balances.length} proveedor{balances.length !== 1 ? 'es' : ''} con saldo pendiente
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">Saldos por proveedor</h2>
        {balancesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin saldos pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className={`${headY} pr-4`}>Proveedor</th>
                  <th className={`${headY} pr-4 text-right`}>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr
                    key={row.supplierId}
                    onClick={() => setStatementFor(row.supplierId)}
                    className="cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
                  >
                    <td className={`${cellY} pr-4 text-slate-800 dark:text-slate-200`}>{row.supplierName}</td>
                    <td className={`${cellY} pr-4 text-right font-semibold text-slate-900 dark:text-slate-100`}>
                      ${Number(row.outstanding).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {statementFor && <SupplierStatementModal supplierId={statementFor} onClose={() => setStatementFor(null)} />}
    </div>
  );
}
