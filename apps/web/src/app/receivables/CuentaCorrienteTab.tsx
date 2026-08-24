'use client';

import { companiesApi } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import CustomerStatementView from './CustomerStatementView';

export default function CuentaCorrienteTab() {
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');

  const customersQuery = useQuery({
    queryKey: ['companies', 'CUSTOMER'],
    queryFn: () => companiesApi.list('CUSTOMER'),
  });
  const customers = customersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered =
    normalizedSearch === ''
      ? customers
      : customers.filter(
          (c) => c.name.toLowerCase().includes(normalizedSearch) || (c.taxId ?? '').includes(normalizedSearch),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Buscar por nombre o CUIT</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Cliente</span>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-72 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          >
            <option value="">Elegir cliente...</option>
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.taxId ? ` (${c.taxId})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {customerId ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <CustomerStatementView customerId={customerId} />
        </div>
      ) : (
        <p className="text-sm text-slate-400 dark:text-slate-600">Elegí un cliente para ver su cuenta corriente.</p>
      )}
    </div>
  );
}
