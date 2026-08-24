'use client';

import { companiesApi } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import SupplierStatementView from './SupplierStatementView';

export default function CuentaCorrienteTab() {
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const suppliers = suppliersQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const filtered =
    normalizedSearch === ''
      ? suppliers
      : suppliers.filter(
          (s) => s.name.toLowerCase().includes(normalizedSearch) || (s.taxId ?? '').includes(normalizedSearch),
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
            placeholder="Buscar proveedor..."
            className="w-64 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-600 dark:text-slate-400">Proveedor</span>
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="w-72 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
          >
            <option value="">Elegir proveedor...</option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.taxId ? ` (${s.taxId})` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {supplierId ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
          <SupplierStatementView supplierId={supplierId} />
        </div>
      ) : (
        <p className="text-sm text-slate-400 dark:text-slate-600">Elegí un proveedor para ver su cuenta corriente.</p>
      )}
    </div>
  );
}
