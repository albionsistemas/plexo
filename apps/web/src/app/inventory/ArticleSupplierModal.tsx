'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import { companiesApi } from '@/lib/companies';
import { inventoryApi } from '@/lib/inventory';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

interface Props {
  article: { id: string; name: string; preferredSupplierId: string | null };
  onClose: () => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** One preferred supplier per article (decision with the user,
 * 2026-07-27) - "quién nos vende esto habitualmente", used to pre-fill
 * the supplier when armando un Pedido de Cotización/Orden de Compra for
 * this article. Same lightweight-modal pattern as ArticleImageModal,
 * not the full article create/edit form that still doesn't exist. */
export default function ArticleSupplierModal({ article, onClose }: Props) {
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState(article.preferredSupplierId ?? '');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [error, setError] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['companies', 'SUPPLIER'],
    queryFn: () => companiesApi.list('SUPPLIER'),
  });
  const suppliers = suppliersQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: () => inventoryApi.updateArticle(article.id, { preferredSupplierId: supplierId || null }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo guardar el proveedor';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Proveedor de {article.name}
          </h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm text-slate-600 dark:text-slate-400">Proveedor preferido</label>
          <button
            type="button"
            onClick={() => setCreatingSupplier(true)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
          >
            + nuevo proveedor
          </button>
        </div>
        <select className={`${inputClass} mb-4 w-full`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">— Ninguno —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-600 dark:text-slate-400 transition hover:text-slate-800 dark:hover:text-slate-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
          >
            {mutation.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {creatingSupplier && (
        <CompanyFormModal
          defaultRoles={['SUPPLIER']}
          onClose={() => setCreatingSupplier(false)}
          onSaved={(c) => setSupplierId(c.id)}
        />
      )}
    </div>
  );
}
