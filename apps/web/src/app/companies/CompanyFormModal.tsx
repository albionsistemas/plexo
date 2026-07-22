'use client';

import { companiesApi, type Company, type CompanyRoleType } from '@/lib/companies';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  company?: Company;
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

const ROLE_OPTIONS: { value: CompanyRoleType; label: string }[] = [
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'SUPPLIER', label: 'Proveedor' },
  { value: 'BRANCH', label: 'Sucursal / punto de venta propio' },
];

export default function CompanyFormModal({ company, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(company);

  const [name, setName] = useState(company?.name ?? '');
  const [taxId, setTaxId] = useState(company?.taxId ?? '');
  const [email, setEmail] = useState(company?.email ?? '');
  const [creditLimit, setCreditLimit] = useState(company?.creditLimit ?? '0');
  const [pointOfSaleNumber, setPointOfSaleNumber] = useState(company?.pointOfSaleNumber ?? '');
  const [roles, setRoles] = useState<CompanyRoleType[]>(
    company?.roles.map((r) => r.role) ?? ['CUSTOMER'],
  );
  const [error, setError] = useState('');
  const [afipMessage, setAfipMessage] = useState('');
  const [afipError, setAfipError] = useState('');

  const afipLookup = useMutation({
    mutationFn: () => companiesApi.lookupAfip(taxId),
    onSuccess: (data) => {
      setName(data.name);
      setAfipError('');
      setAfipMessage(
        [data.taxCondition, data.fiscalAddress].filter(Boolean).join(' · ') ||
          'Datos encontrados en AFIP',
      );
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      setAfipMessage('');
      const message = err.response?.data?.message ?? 'No se pudo consultar AFIP';
      setAfipError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const mutation = useMutation({
    mutationFn: () => {
      const dto = {
        name,
        taxId: taxId || undefined,
        email: email || undefined,
        creditLimit: Number(creditLimit),
        pointOfSaleNumber: roles.includes('BRANCH') ? pointOfSaleNumber || undefined : undefined,
        roles,
      };
      return company ? companiesApi.update(company.id, dto) : companiesApi.create(dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar la empresa';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function toggleRole(role: CompanyRoleType) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (roles.length === 0) {
      setError('Elegí al menos un rol');
      return;
    }
    if (roles.includes('BRANCH') && !pointOfSaleNumber.trim()) {
      setError('Una sucursal necesita un número de punto de venta');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isEdit ? 'Editar empresa' : 'Nueva empresa'}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="Nombre">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CUIT / Tax ID">
              <input className={inputClass} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
              <button
                type="button"
                onClick={() => afipLookup.mutate()}
                disabled={afipLookup.isPending || !taxId.trim()}
                className="self-start text-xs text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-800 dark:hover:text-indigo-300 disabled:opacity-50"
              >
                {afipLookup.isPending ? 'Consultando AFIP...' : 'Buscar en AFIP'}
              </button>
              {afipMessage && <p className="text-xs text-slate-600 dark:text-slate-400">{afipMessage}</p>}
              {afipError && <p className="text-xs text-red-600 dark:text-red-400">{afipError}</p>}
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Roles">
            <div className="flex flex-col gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 p-3">
              {ROLE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={roles.includes(opt.value)}
                    onChange={() => toggleRole(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </Field>

          {roles.includes('CUSTOMER') && (
            <Field label="Límite de crédito">
              <input
                type="number"
                step="any"
                className={inputClass}
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </Field>
          )}

          {roles.includes('BRANCH') && (
            <Field label="Punto de venta (AFIP)">
              <input
                className={inputClass}
                value={pointOfSaleNumber}
                onChange={(e) => setPointOfSaleNumber(e.target.value)}
                placeholder="0001"
              />
            </Field>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-600 dark:text-slate-400">{label}</label>
      {children}
    </div>
  );
}
