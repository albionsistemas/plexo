'use client';

import { companiesApi, type Company, type CompanyRoleType } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import CompanyDetailModal from './CompanyDetailModal';
import CompanyFormModal from './CompanyFormModal';

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Proveedor',
  BRANCH: 'Sucursal',
};

const ROLE_FILTERS: { value: CompanyRoleType | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'SUPPLIER', label: 'Proveedores' },
  { value: 'BRANCH', label: 'Sucursales' },
];

export default function CompaniesPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<CompanyRoleType | ''>('');
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Company | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);

  const companiesQuery = useQuery({
    queryKey: ['companies', roleFilter || 'ALL'],
    queryFn: () => companiesApi.list(roleFilter || undefined),
  });

  const companies = companiesQuery.data ?? [];
  const normalizedSearch = search.trim().toLowerCase();
  const rows =
    normalizedSearch === ''
      ? companies
      : companies.filter(
          (c) =>
            c.name.toLowerCase().includes(normalizedSearch) ||
            (c.taxId ?? '').includes(normalizedSearch),
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Empresas</h1>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} empresa{rows.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setNewOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nueva empresa
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o CUIT..."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 sm:max-w-sm"
        />
        <div className="flex gap-2">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setRoleFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                roleFilter === f.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {companiesQuery.isLoading ? (
          <div className="flex h-40 items-center justify-center text-slate-500">
            Cargando empresas...
          </div>
        ) : companiesQuery.error ? (
          <div className="flex h-40 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar las empresas
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-slate-400 dark:text-slate-600">
            Sin empresas que coincidan
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Nombre</th>
                  <th className="pb-2 pr-4">Roles</th>
                  <th className="pb-2 pr-4">CUIT</th>
                  <th className="pb-2 pr-4">Email</th>
                  <th className="pb-2 pr-4 text-right">Crédito / PV</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">{c.name}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {c.roles.map((r) => (
                          <span
                            key={r.role}
                            className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400"
                          >
                            {ROLE_LABELS[r.role] ?? r.role}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{c.taxId ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{c.email ?? '—'}</td>
                    <td className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                      {c.roles.some((r) => r.role === 'BRANCH')
                        ? (c.pointOfSaleNumber ?? '—')
                        : `$${Number(c.creditLimit).toFixed(2)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newOpen && <CompanyFormModal onClose={() => setNewOpen(false)} />}
      {selected && (
        <CompanyDetailModal
          company={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditing(selected);
            setSelected(null);
          }}
        />
      )}
      {editing && <CompanyFormModal company={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
