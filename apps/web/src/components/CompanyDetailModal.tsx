'use client';

import { companiesApi, type Company, type CompanyRoleType, type Person } from '@/lib/companies';
import { formatCuitInput } from '@/lib/cuit';
import { resolveUploadUrl } from '@/lib/inventory';
import { initials } from '@/lib/profile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';
import { ROLE_LABELS } from './CompanyFormModal';
import PersonAvatarModal from './PersonAvatarModal';

interface Props {
  company: Company;
  onClose: () => void;
  /** Absent in the read-only "todas las empresas" view (/companies) -
   * there's no full edit surface there anymore, only the roles mini-editor
   * below. */
  onEdit?: () => void;
  /** Read-only "todas las empresas" view: hides edit/activate-deactivate,
   * hides adding/removing contacts, but still allows the narrow "Editar
   * roles" action (the only role-set editing surface left once /clients,
   * /suppliers and "Mis sucursales" all lock their role). */
  readOnly?: boolean;
}

const ROLE_OPTIONS: { value: CompanyRoleType; label: string }[] = [
  { value: 'CUSTOMER', label: 'Cliente' },
  { value: 'SUPPLIER', label: 'Proveedor' },
  { value: 'BRANCH', label: 'Sucursal / punto de venta propio' },
];

const INDUSTRY_LABELS: Record<string, string> = {
  COMERCIO: 'Comercio',
  SERVICIOS: 'Servicios',
  INDUSTRIA: 'Industria',
  CONSTRUCCION: 'Construcción',
  AGRO: 'Agro',
  TECNOLOGIA: 'Tecnología',
  SALUD: 'Salud',
  EDUCACION: 'Educación',
  GASTRONOMIA: 'Gastronomía',
  TRANSPORTE: 'Transporte',
  INMOBILIARIO: 'Inmobiliario',
  OTRO: 'Otro',
};

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

export default function CompanyDetailModal({ company, onClose, onEdit, readOnly }: Props) {
  const queryClient = useQueryClient();
  const canHaveContacts = company.roles.some(
    (r) => r.role === 'CUSTOMER' || r.role === 'SUPPLIER',
  );
  const [activeError, setActiveError] = useState('');
  const [editingRoles, setEditingRoles] = useState(false);
  const [rolesDraft, setRolesDraft] = useState<CompanyRoleType[]>(company.roles.map((r) => r.role));
  const [rolesError, setRolesError] = useState('');

  const { data: detail } = useQuery({
    queryKey: ['company', company.id],
    queryFn: () => companiesApi.get(company.id),
  });

  // detail?.active reflects the just-toggled value once the query
  // refetches; company.active is the row the list handed us when the
  // modal opened and never updates - detail is the source of truth here.
  const isActive = detail?.active ?? company.active;
  const currentRoles = detail?.roles.map((r) => r.role) ?? company.roles.map((r) => r.role);

  const toggleActiveMutation = useMutation({
    mutationFn: () => companiesApi.update(company.id, { active: !isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      void queryClient.invalidateQueries({ queryKey: ['company', company.id] });
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo actualizar la empresa';
      setActiveError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const rolesMutation = useMutation({
    mutationFn: () => companiesApi.update(company.id, { roles: rolesDraft }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      void queryClient.invalidateQueries({ queryKey: ['company', company.id] });
      setEditingRoles(false);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudieron guardar los roles';
      setRolesError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  function toggleRoleDraft(role: CompanyRoleType) {
    setRolesDraft((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function saveRoles() {
    setRolesError('');
    if (rolesDraft.length === 0) {
      setRolesError('Elegí al menos un rol');
      return;
    }
    rolesMutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img
                src={company.logoUrl}
                alt=""
                className="h-9 w-9 shrink-0 rounded-lg border border-slate-300 dark:border-slate-700 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{company.name}</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {currentRoles.map((role) => (
            <span
              key={role}
              className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              {ROLE_LABELS[role] ?? role}
            </span>
          ))}
          {!isActive && (
            <span className="rounded bg-red-100 dark:bg-red-900 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
              Inactiva
            </span>
          )}
          {readOnly && !editingRoles && (
            <button
              onClick={() => {
                setRolesDraft(currentRoles);
                setEditingRoles(true);
              }}
              className="text-xs text-indigo-600 dark:text-indigo-400 transition hover:text-indigo-800 dark:hover:text-indigo-300"
            >
              Editar roles
            </button>
          )}
        </div>

        {editingRoles && (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 p-3">
            {ROLE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={rolesDraft.includes(opt.value)}
                  onChange={() => toggleRoleDraft(opt.value)}
                />
                {opt.label}
              </label>
            ))}
            {rolesError && <p className="text-xs text-red-600 dark:text-red-400">{rolesError}</p>}
            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRoles(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveRoles}
                disabled={rolesMutation.isPending}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {rolesMutation.isPending ? 'Guardando...' : 'Guardar roles'}
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-slate-500">CUIT / Tax ID</p>
            <p className="text-slate-700 dark:text-slate-300">
              {company.taxId ? formatCuitInput(company.taxId) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="text-slate-700 dark:text-slate-300">{company.email ?? '—'}</p>
          </div>
          {company.taxCondition && (
            <div>
              <p className="text-xs text-slate-500">Condición IVA (AFIP)</p>
              <p className="text-slate-700 dark:text-slate-300">{company.taxCondition}</p>
            </div>
          )}
          {company.fiscalAddress && (
            <div>
              <p className="text-xs text-slate-500">Domicilio fiscal (AFIP)</p>
              <p className="text-slate-700 dark:text-slate-300">{company.fiscalAddress}</p>
            </div>
          )}
          {company.industry && (
            <div>
              <p className="text-xs text-slate-500">Rubro</p>
              <p className="text-slate-700 dark:text-slate-300">
                {INDUSTRY_LABELS[company.industry] ?? company.industry}
              </p>
            </div>
          )}
          {company.grossIncomeNumber && (
            <div>
              <p className="text-xs text-slate-500">Ingresos Brutos (IIBB)</p>
              <p className="text-slate-700 dark:text-slate-300">{company.grossIncomeNumber}</p>
            </div>
          )}
          {company.roles.some((r) => r.role === 'CUSTOMER') && (
            <div>
              <p className="text-xs text-slate-500">Límite de crédito</p>
              <p className="text-slate-700 dark:text-slate-300">${Number(company.creditLimit).toFixed(2)}</p>
            </div>
          )}
          {company.roles.some((r) => r.role === 'BRANCH') && (
            <div>
              <p className="text-xs text-slate-500">Punto de venta</p>
              <p className="text-slate-700 dark:text-slate-300">{company.pointOfSaleNumber ?? '—'}</p>
            </div>
          )}
          {company.roles.some((r) => r.role === 'CUSTOMER') &&
            (company.withholdsVat || company.withholdsIncomeTax || company.withholdsGrossIncome) && (
              <div className="col-span-2">
                <p className="text-xs text-slate-500">Retenciones (agente AFIP/ARBA)</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {company.withholdsVat && (
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                      IVA
                    </span>
                  )}
                  {company.withholdsIncomeTax && (
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                      Ganancias
                    </span>
                  )}
                  {company.withholdsGrossIncome && (
                    <span className="rounded bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                      Ingresos Brutos
                    </span>
                  )}
                </div>
              </div>
            )}
        </div>

        {!readOnly && (
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={onEdit}
              className="rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
            >
              Editar empresa
            </button>

            <button
              onClick={() => toggleActiveMutation.mutate()}
              disabled={toggleActiveMutation.isPending}
              className={
                isActive
                  ? 'rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50'
                  : 'rounded-lg border border-green-300 dark:border-green-800 px-3 py-1.5 text-xs text-green-600 dark:text-green-400 transition hover:bg-green-50 dark:hover:bg-green-950 disabled:opacity-50'
              }
            >
              {toggleActiveMutation.isPending
                ? 'Guardando...'
                : isActive
                  ? 'Desactivar empresa'
                  : 'Activar empresa'}
            </button>
          </div>
        )}
        {activeError && <p className="mb-4 text-xs text-red-600 dark:text-red-400">{activeError}</p>}

        {canHaveContacts && (
          <>
            <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">Contactos</h3>
            <div className="mb-4 flex flex-col gap-2">
              {(detail?.people ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-600">Sin contactos cargados</p>
              ) : (
                detail?.people.map((person) => (
                  <ContactRow key={person.id} person={person} companyId={company.id} readOnly={readOnly} />
                ))
              )}
            </div>
            {!readOnly && <NewPersonForm companyId={company.id} />}
          </>
        )}

        {company.roles.some((r) => r.role === 'SUPPLIER') && (
          <div className={canHaveContacts ? 'mt-6 border-t border-slate-200 dark:border-slate-800 pt-4' : ''}>
            <h3 className="mb-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              Artículos que prefieren este proveedor
            </h3>
            {(detail?.preferredForArticles ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-600">
                Ningún artículo tiene a este proveedor como preferido todavía
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail?.preferredForArticles.map((article) => (
                  <li
                    key={article.id}
                    className="rounded-lg bg-slate-200/50 dark:bg-slate-800/50 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200"
                  >
                    {article.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ContactRow({
  person,
  companyId,
  readOnly,
}: {
  person: Person;
  companyId: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => companiesApi.removePerson(person.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company', companyId] });
    },
  });

  const avatarUrl = resolveUploadUrl(person.avatarUrl);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-200/50 dark:bg-slate-800/50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => !readOnly && setEditingAvatar(true)}
            disabled={readOnly}
            title={readOnly ? undefined : 'Cambiar foto'}
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-300 dark:border-slate-700 bg-slate-300 dark:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 disabled:cursor-default"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(`${person.firstName} ${person.lastName ?? ''}`.trim(), person.email ?? person.firstName)
            )}
          </button>
          <div>
            <p className="text-slate-800 dark:text-slate-200">
              {person.firstName} {person.lastName}
              {person.nickname && <span className="text-slate-500"> ({person.nickname})</span>}
            </p>
            <p className="text-xs text-slate-500">{person.jobTitle}</p>
            <p className="text-xs text-slate-500">
              {[person.email, person.whatsapp].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        {!readOnly &&
          (confirmingDelete ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
              >
                Confirmar
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="Eliminar contacto"
              className="shrink-0 text-slate-400 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400"
            >
              ✕
            </button>
          ))}
      </div>
      {editingAvatar && (
        <PersonAvatarModal person={person} companyId={companyId} onClose={() => setEditingAvatar(false)} />
      )}
    </div>
  );
}

export function NewPersonForm({ companyId }: { companyId: string }) {
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-slate-200 dark:border-slate-800 pt-4">
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
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
