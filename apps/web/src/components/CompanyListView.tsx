'use client';

import { companiesApi, type Company, type CompanyRoleType } from '@/lib/companies';
import { formatCuitInput } from '@/lib/cuit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import AddContactsModal from './AddContactsModal';
import CompanyDetailModal from './CompanyDetailModal';
import CompanyFormModal, { ROLE_LABELS } from './CompanyFormModal';

const ROLE_FILTERS: { value: CompanyRoleType | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'CUSTOMER', label: 'Clientes' },
  { value: 'SUPPLIER', label: 'Proveedores' },
  { value: 'BRANCH', label: 'Sucursales' },
];

interface Props {
  /** Fixed role for a dedicated screen (/clients, /suppliers, "Mis
   * sucursales" en Preferencias) - the list only shows companies with this
   * role, and the create form locks to it (no roles checkbox). Omitted
   * only for /companies ("todas las empresas"), which shows every company
   * with a browsing-only role filter instead. */
  role?: CompanyRoleType;
  /** false makes this a read-only browsing view (/companies): no "+
   * Nuevo", detail modal opens without edit/deactivate/contacts actions
   * (still allows the narrow "Editar roles" action). */
  editable: boolean;
  title: string;
  newLabel?: string;
  /** 'card' renders as an embedded section matching the other Preferencias
   * cards (h2, bordered container) instead of a standalone page (h1). */
  variant?: 'page' | 'card';
  /** Tras crear una empresa nueva (no al editar), abre AddContactsModal para
   * esa empresa en vez de sólo cerrar el formulario - pensado para /suppliers
   * (y cualquier otra pantalla de rol único donde tenga sentido cargar
   * contactos de una), no para /companies ni "Mis sucursales" (una sucursal
   * no puede tener contactos, ver CompaniesService.createPerson). */
  promptContactsAfterCreate?: boolean;
}

export default function CompanyListView({
  role,
  editable,
  title,
  newLabel,
  variant = 'page',
  promptContactsAfterCreate,
}: Props) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<CompanyRoleType | ''>('');
  const [showInactive, setShowInactive] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Company | null>(null);
  const [editing, setEditing] = useState<Company | null>(null);
  const [addingContactsTo, setAddingContactsTo] = useState<Company | null>(null);

  const effectiveRoleFilter = role ?? roleFilter;

  const companiesQuery = useQuery({
    queryKey: ['companies', effectiveRoleFilter || 'ALL', showInactive],
    queryFn: () => companiesApi.list(effectiveRoleFilter || undefined, showInactive),
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

  const heading = variant === 'card' ? (
    <h2 className="mb-1 text-sm font-medium text-slate-600 dark:text-slate-400">{title}</h2>
  ) : (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="mt-1 text-xs text-slate-500">
        {rows.length} empresa{rows.length !== 1 ? 's' : ''}
      </p>
    </div>
  );

  const body = (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        {heading}
        {editable && (
          <button
            onClick={() => setNewOpen(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            {newLabel ?? '+ Nueva empresa'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o CUIT..."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 sm:max-w-sm"
        />
        <div className="flex items-center gap-2">
          {!role &&
            ROLE_FILTERS.map((f) => (
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
          <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Mostrar inactivas
          </label>
        </div>
      </div>

      <div
        className={
          variant === 'card'
            ? ''
            : 'rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4'
        }
      >
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
                    className={`cursor-pointer border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 ${!c.active ? 'opacity-50' : ''}`}
                  >
                    <td className="py-2 pr-4 text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-2">
                        {c.logoUrl ? (
                          <img
                            src={c.logoUrl}
                            alt=""
                            className="h-6 w-6 shrink-0 rounded border border-slate-300 dark:border-slate-700 object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-200 dark:bg-slate-800 text-xs font-medium text-slate-500">
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                        {c.name}
                      </div>
                    </td>
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
                        {!c.active && (
                          <span className="rounded bg-red-100 dark:bg-red-900 px-2 py-0.5 text-xs text-red-700 dark:text-red-300">
                            Inactiva
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                      {c.taxId ? formatCuitInput(c.taxId) : '—'}
                    </td>
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

      {newOpen && (
        <CompanyFormModal
          onClose={() => setNewOpen(false)}
          lockedRole={editable ? role : undefined}
          onSaved={promptContactsAfterCreate ? (saved) => setAddingContactsTo(saved) : undefined}
        />
      )}
      {addingContactsTo && (
        <AddContactsModal company={addingContactsTo} onClose={() => setAddingContactsTo(null)} />
      )}
      {selected && (
        <CompanyDetailModal
          company={selected}
          onClose={() => setSelected(null)}
          readOnly={!editable}
          onEdit={
            editable
              ? () => {
                  setEditing(selected);
                  setSelected(null);
                }
              : undefined
          }
        />
      )}
      {editing && (
        <CompanyFormModal company={editing} onClose={() => setEditing(null)} lockedRole={role} />
      )}
    </div>
  );

  if (variant === 'card') {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6">
        {body}
      </div>
    );
  }
  return body;
}
