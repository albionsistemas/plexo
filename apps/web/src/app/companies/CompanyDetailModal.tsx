'use client';

import { companiesApi, type Company } from '@/lib/companies';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  company: Company;
  onClose: () => void;
  onEdit: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Proveedor',
  BRANCH: 'Sucursal',
};

const inputClass =
  'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500';

export default function CompanyDetailModal({ company, onClose, onEdit }: Props) {
  const canHaveContacts = company.roles.some(
    (r) => r.role === 'CUSTOMER' || r.role === 'SUPPLIER',
  );

  const { data: detail } = useQuery({
    queryKey: ['company', company.id],
    queryFn: () => companiesApi.get(company.id),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">{company.name}</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-300">
            ✕
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {company.roles.map((r) => (
            <span
              key={r.role}
              className="rounded bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-300"
            >
              {ROLE_LABELS[r.role] ?? r.role}
            </span>
          ))}
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">CUIT / Tax ID</p>
            <p className="text-slate-300">{company.taxId ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="text-slate-300">{company.email ?? '—'}</p>
          </div>
          {company.roles.some((r) => r.role === 'CUSTOMER') && (
            <div>
              <p className="text-xs text-slate-500">Límite de crédito</p>
              <p className="text-slate-300">${Number(company.creditLimit).toFixed(2)}</p>
            </div>
          )}
          {company.roles.some((r) => r.role === 'BRANCH') && (
            <div>
              <p className="text-xs text-slate-500">Punto de venta</p>
              <p className="text-slate-300">{company.pointOfSaleNumber ?? '—'}</p>
            </div>
          )}
        </div>

        <button
          onClick={onEdit}
          className="mb-6 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800"
        >
          Editar empresa
        </button>

        {canHaveContacts && (
          <>
            <h3 className="mb-3 text-sm font-medium text-slate-400">Contactos</h3>
            <div className="mb-4 flex flex-col gap-2">
              {(detail?.people ?? []).length === 0 ? (
                <p className="text-sm text-slate-600">Sin contactos cargados</p>
              ) : (
                detail?.people.map((person) => (
                  <div
                    key={person.id}
                    className="rounded-lg border border-slate-800 bg-slate-800/50 p-3 text-sm"
                  >
                    <p className="text-slate-200">
                      {person.firstName} {person.lastName}
                      {person.nickname && (
                        <span className="text-slate-500"> ({person.nickname})</span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">{person.jobTitle}</p>
                    <p className="text-xs text-slate-500">
                      {[person.email, person.whatsapp].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))
              )}
            </div>
            <NewPersonForm companyId={company.id} />
          </>
        )}
      </div>
    </div>
  );
}

function NewPersonForm({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      companiesApi.createPerson({
        companyId,
        firstName,
        lastName: lastName || undefined,
        jobTitle: jobTitle || undefined,
        email: email || undefined,
        whatsapp: whatsapp || undefined,
      }),
    onSuccess: () => {
      setFirstName('');
      setLastName('');
      setJobTitle('');
      setEmail('');
      setWhatsapp('');
      void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo agregar el contacto';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!firstName.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-slate-800 pt-4">
      <p className="text-xs text-slate-500">Agregar contacto</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          className={inputClass}
          placeholder="Nombre"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Apellido"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Cargo"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={inputClass}
          placeholder="WhatsApp"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-1 self-start rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {mutation.isPending ? 'Agregando...' : '+ Agregar contacto'}
      </button>
    </form>
  );
}
