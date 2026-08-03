'use client';

import { companiesApi, type Company } from '@/lib/companies';
import { useQuery } from '@tanstack/react-query';
import { ContactRow, NewPersonForm } from './CompanyDetailModal';

interface Props {
  company: Company;
  onClose: () => void;
}

/** Paso de onboarding mostrado justo después de crear un proveedor (ver
 * CompanyListView) - separado de CompanyDetailModal (que muestra roles/CUIT/
 * edición/etc., demasiado para este momento puntual) para que el usuario
 * pueda cargar de una vez a las personas con las que realmente va a hablar,
 * sin tener que volver a entrar a la ficha después. Reusa ContactRow/
 * NewPersonForm tal cual (foto de perfil por archivo/URL incluida vía
 * PersonAvatarModal), no duplica esa lógica. */
export default function AddContactsModal({ company, onClose }: Props) {
  const { data: detail } = useQuery({
    queryKey: ['company', company.id],
    queryFn: () => companiesApi.get(company.id),
  });
  const people = detail?.people ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Agregar contactos de {company.name}
        </h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">
          Cargá a las personas con las que realmente vas a trabajar en esta empresa - podés agregar
          varias, cada una con su foto de perfil (o sin ella).
        </p>

        <div className="mb-4 flex flex-col gap-2">
          {people.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-600">Todavía no agregaste ningún contacto</p>
          ) : (
            people.map((person) => (
              <ContactRow key={person.id} person={person} companyId={company.id} />
            ))
          )}
        </div>

        <NewPersonForm companyId={company.id} />

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 transition hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          {people.length === 0 ? 'Omitir' : 'Listo, terminar'}
        </button>
      </div>
    </div>
  );
}
