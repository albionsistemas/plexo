'use client';

import { accountingApi, type AccountType } from '@/lib/accounting';
import { useQuery } from '@tanstack/react-query';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

export default function TrialBalanceTab() {
  const { data: rows, isLoading, error } = useQuery({
    queryKey: ['accounting-trial-balance'],
    queryFn: accountingApi.getTrialBalance,
  });

  const totalDebit = (rows ?? []).reduce((s, r) => s + Number(r.debitTotal), 0);
  const totalCredit = (rows ?? []).reduce((s, r) => s + Number(r.creditTotal), 0);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      {isLoading ? (
        <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
      ) : error ? (
        <div className="flex h-32 items-center justify-center text-red-400">
          Error al cargar el balance
        </div>
      ) : rows?.length === 0 ? (
        <p className="text-sm text-slate-600">Sin movimientos todavía</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Código</th>
                <th className="pb-2 pr-4">Cuenta</th>
                <th className="pb-2 pr-4">Tipo</th>
                <th className="pb-2 pr-4 text-right">Debe</th>
                <th className="pb-2 pr-4 text-right">Haber</th>
                <th className="pb-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row) => (
                <tr key={row.accountId} className="border-b border-slate-800/50">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-400">{row.code}</td>
                  <td className="py-2 pr-4 text-slate-200">{row.name}</td>
                  <td className="py-2 pr-4 text-slate-400">{TYPE_LABELS[row.type]}</td>
                  <td className="py-2 pr-4 text-right text-slate-300">
                    ${Number(row.debitTotal).toFixed(2)}
                  </td>
                  <td className="py-2 pr-4 text-right text-slate-300">
                    ${Number(row.creditTotal).toFixed(2)}
                  </td>
                  <td className="py-2 text-right font-semibold text-slate-100">
                    ${Number(row.balance).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-700 text-sm font-semibold text-slate-200">
                <td className="pt-2" colSpan={3}>
                  Totales
                </td>
                <td className="pt-2 pr-4 text-right">${totalDebit.toFixed(2)}</td>
                <td className="pt-2 pr-4 text-right">${totalCredit.toFixed(2)}</td>
                <td className="pt-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
