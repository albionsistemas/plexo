'use client';

import { accountingApi, type AccountType } from '@/lib/accounting';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewAccountModal from './NewAccountModal';

const TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Activo',
  LIABILITY: 'Pasivo',
  EQUITY: 'Patrimonio',
  INCOME: 'Ingreso',
  EXPENSE: 'Gasto',
};

export default function AccountsTab() {
  const [newOpen, setNewOpen] = useState(false);
  const { data: accounts, isLoading, error } = useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: accountingApi.listAccounts,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{accounts?.length ?? 0} cuentas</p>
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nueva cuenta
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-slate-500">Cargando...</div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar el plan de cuentas
          </div>
        ) : accounts?.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-600">Sin cuentas creadas</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                <th className="pb-2 pr-4">Código</th>
                <th className="pb-2 pr-4">Nombre</th>
                <th className="pb-2">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {accounts?.map((acc) => (
                <tr key={acc.id} className="border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{acc.code}</td>
                  <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{acc.name}</td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">{TYPE_LABELS[acc.type]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {newOpen && <NewAccountModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}
