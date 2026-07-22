'use client';

import { receivablesApi } from '@/lib/receivables';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import StatementModal from './StatementModal';

export default function ReceivablesPage() {
  const queryClient = useQueryClient();
  const [statementFor, setStatementFor] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState('');

  const agingQuery = useQuery({
    queryKey: ['receivables-aging'],
    queryFn: receivablesApi.getAgingReport,
  });
  const balancesQuery = useQuery({
    queryKey: ['receivables-balances'],
    queryFn: receivablesApi.listCustomerBalances,
  });

  const refreshMutation = useMutation({
    mutationFn: receivablesApi.refreshOverdueStatuses,
    onSuccess: (result) => {
      setRefreshMessage(`${result.updated} factura(s) marcada(s) como vencidas`);
      void queryClient.invalidateQueries({ queryKey: ['receivables-aging'] });
      void queryClient.invalidateQueries({ queryKey: ['receivables-balances'] });
    },
  });

  const aging = agingQuery.data ?? [];
  const balances = balancesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Cuentas a Cobrar</h1>
          <p className="mt-1 text-xs text-slate-500">
            {balances.length} cliente{balances.length !== 1 ? 's' : ''} con saldo pendiente
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshMessage && <span className="text-xs text-slate-500">{refreshMessage}</span>}
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {refreshMutation.isPending ? 'Actualizando...' : 'Actualizar vencidos'}
          </button>
        </div>
      </div>

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
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4 text-right">Al día</th>
                  <th className="pb-2 pr-4 text-right">1-30</th>
                  <th className="pb-2 pr-4 text-right">31-60</th>
                  <th className="pb-2 pr-4 text-right">61-90</th>
                  <th className="pb-2 pr-4 text-right">90+</th>
                  <th className="pb-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {aging.map((row) => (
                  <tr
                    key={row.customerId}
                    onClick={() => setStatementFor(row.customerId)}
                    className="cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{row.customerName}</td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      ${Number(row.current).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      ${Number(row.days1to30).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-amber-600 dark:text-amber-400">
                      ${Number(row.days31to60).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-orange-400">
                      ${Number(row.days61to90).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-red-600 dark:text-red-400">
                      ${Number(row.days90Plus).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right font-semibold text-slate-900 dark:text-slate-100">
                      ${Number(row.totalOutstanding).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-600 dark:text-slate-400">Saldos y límite de crédito</h2>
        {balancesQuery.isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin saldos pendientes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4 text-right">Límite de crédito</th>
                  <th className="pb-2 pr-4 text-right">Saldo</th>
                  <th className="pb-2 pr-4 text-right">Disponible</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((row) => (
                  <tr
                    key={row.customerId}
                    onClick={() => setStatementFor(row.customerId)}
                    className="cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{row.customerName}</td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      ${Number(row.creditLimit).toFixed(2)}
                    </td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      ${Number(row.outstanding).toFixed(2)}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right font-semibold ${Number(row.availableCredit) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}
                    >
                      ${Number(row.availableCredit).toFixed(2)}
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
