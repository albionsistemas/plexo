'use client';

import { reportsApi, type FinancialAccountProvider } from '@/lib/reports';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import NewFinancialAccountModal from '../reports/NewFinancialAccountModal';
import TransferBetweenAccountsModal from '../reports/TransferBetweenAccountsModal';

const PROVIDER_LABELS: Record<FinancialAccountProvider, string> = {
  BANK: 'Banco',
  MERCADOPAGO: 'MercadoPago',
  PAYPAL: 'PayPal',
  CASH: 'Efectivo',
};

function money(amount: string) {
  return `$${Number(amount).toFixed(2)}`;
}

export default function AccountsTab() {
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  const accountsQuery = useQuery({ queryKey: ['financial-accounts'], queryFn: reportsApi.listFinancialAccounts });
  const accounts = accountsQuery.data ?? [];
  const selected = accounts.find((a) => a.id === selectedId);

  const transactionsQuery = useQuery({
    queryKey: ['financial-transactions', selectedId],
    queryFn: () => reportsApi.listTransactions(selectedId),
    enabled: Boolean(selectedId),
  });
  const transactions = transactionsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Cajas y Bancos</h2>
        <div className="flex gap-2">
          {accounts.length >= 2 && (
            <button
              onClick={() => setTransferOpen(true)}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              Transferencia interna
            </button>
          )}
          <button
            onClick={() => setNewAccountOpen(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            + Nueva cuenta
          </button>
        </div>
      </div>

      {accountsQuery.isLoading ? (
        <div className="flex h-24 items-center justify-center text-slate-500">Cargando...</div>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-600">Sin cajas ni cuentas bancarias creadas</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <button
              key={account.id}
              onClick={() => setSelectedId(account.id)}
              className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition ${
                selectedId === account.id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {PROVIDER_LABELS[account.provider]}
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{account.name}</span>
              <span
                className={`text-xl font-bold ${
                  Number(account.currentBalance) < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {money(account.currentBalance)}
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Extracto — {selected.name}
          </h3>
          {transactionsQuery.isLoading ? (
            <div className="flex h-20 items-center justify-center text-slate-500">Cargando...</div>
          ) : transactions.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">Sin movimientos registrados todavía</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                    <th className="pb-2 pr-4">Fecha</th>
                    <th className="pb-2 pr-4">Referencia</th>
                    <th className="pb-2 pr-4 text-right">Importe</th>
                    <th className="pb-2">Conciliado</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-200/50 dark:border-slate-800/50">
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                        {new Date(tx.occurredAt).toLocaleDateString('es-AR')}
                      </td>
                      <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">{tx.externalRef ?? '—'}</td>
                      <td
                        className={`py-2 pr-4 text-right font-medium ${
                          Number(tx.amount) < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {money(tx.amount)}
                      </td>
                      <td className="py-2 text-xs text-slate-500">{tx.reconciled ? 'Sí' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {newAccountOpen && <NewFinancialAccountModal onClose={() => setNewAccountOpen(false)} />}
      {transferOpen && (
        <TransferBetweenAccountsModal
          accounts={accounts}
          defaultFromId={selectedId || accounts[0]?.id || ''}
          onClose={() => setTransferOpen(false)}
        />
      )}
    </div>
  );
}
