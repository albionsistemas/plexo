'use client';

import { inventoryApi, UNIT_OF_MEASURE_OPTIONS } from '@/lib/inventory';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useState } from 'react';

export interface CreatedArticleVariantRef {
  variantId: string;
  articleId: string;
  articleName: string;
  sku: string;
  unitPrice: number;
}

interface Props {
  onClose: () => void;
  // Sólo se usa cuando este modal se abre desde ArticlePicker ("+ nuevo
  // artículo") - el picker arma su propia opción a partir de esto y llama
  // a su propio onChange, en vez de esperar el refetch de la lista.
  onSaved?: (created: CreatedArticleVariantRef) => void;
}

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

/** Crear un artículo (+ su primera variante/SKU) de punta a punta - hasta
 * ahora no existía ningún flujo manual para esto (sólo importación por
 * Excel, ver PROGRESS.md). Vive en components/ (no app/inventory/) porque
 * ArticlePicker (también components/) necesita abrirlo desde cualquier
 * formulario, no sólo desde Inventario - mismo criterio que CompanyFormModal.
 * Alcance v1 deliberadamente mínimo: sin categoría/impuesto/imagen/variantes
 * adicionales - eso se completa después editando el artículo desde la tabla
 * de Inventario. Costo + % de remarca son sólo para sugerir el precio de
 * venta (editable), nunca lo fuerzan. */
export default function ArticleFormModal({ onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });

  const [name, setName] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState<string>('UNIT');
  const [sku, setSku] = useState('');
  const [costInput, setCostInput] = useState('');
  const [markupInput, setMarkupInput] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [error, setError] = useState('');

  const defaultMarkup = settingsQuery.data?.defaultMarkupPercent;
  const effectiveMarkup = markupInput.trim() !== '' ? Number(markupInput) : defaultMarkup;
  const suggestedPrice =
    costInput.trim() !== '' && effectiveMarkup != null && !Number.isNaN(effectiveMarkup)
      ? Number(costInput) * (1 + effectiveMarkup / 100)
      : null;

  const mutation = useMutation({
    mutationFn: async () => {
      const article = await inventoryApi.createArticle({
        name: name.trim(),
        unitOfMeasure,
        markupPercent: markupInput.trim() === '' ? undefined : Number(markupInput),
      });
      const variant = await inventoryApi.createArticleVariant({
        articleId: article.id,
        sku: sku.trim(),
        unitPrice: Number(priceInput),
        costPrice: costInput.trim() === '' ? undefined : Number(costInput),
      });
      return {
        variantId: variant.id,
        articleId: article.id,
        articleName: article.name,
        sku: variant.sku,
        unitPrice: Number(variant.unitPrice),
      };
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
      onSaved?.(created);
      onClose();
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear el artículo';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  // Sin <form>/onSubmit a propósito: este modal se abre desde ArticlePicker,
  // que a su vez vive DENTRO del <form> de cada uno de los 6 formularios que
  // lo usan - un <form> anidado adentro de otro no es válido en HTML, y el
  // submit del interno terminaba burbujeando hasta el <form> externo Y
  // disparando encima el submit nativo del navegador (recarga de página,
  // perdiendo lo cargado) en vez de sólo correr el handler de React.
  // Encontrado probando en Chrome, no en build/test. Un botón type="button"
  // con onClick evita depender de semántica de formulario nativa por
  // completo, sin importar dónde se monte este modal.
  function handleSubmit() {
    setError('');
    if (!name.trim()) {
      setError('Ingresá un nombre');
      return;
    }
    if (!sku.trim()) {
      setError('Ingresá un SKU');
      return;
    }
    if (priceInput.trim() === '' || Number(priceInput) <= 0) {
      setError('Ingresá un precio de venta válido');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nuevo artículo</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600 dark:text-slate-400">Nombre</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="p. ej. Agua mineral 500ml"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">Unidad de medida</span>
              <select value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} className={inputClass}>
                {UNIT_OF_MEASURE_OPTIONS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">SKU</span>
              <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} placeholder="p. ej. AGUA-500" />
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">Costo inicial</span>
              <input
                type="number"
                min={0}
                step="any"
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                className={inputClass}
                placeholder="Opcional"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">% remarca</span>
              <input
                type="number"
                min={0}
                step="any"
                value={markupInput}
                onChange={(e) => setMarkupInput(e.target.value)}
                className={inputClass}
                placeholder={defaultMarkup != null ? `Default: ${defaultMarkup}` : 'Opcional'}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600 dark:text-slate-400">Precio de venta</span>
              <input
                type="number"
                min={0}
                step="any"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          {suggestedPrice !== null && (
            <p className="text-xs text-slate-500">
              Sugerido según costo × remarca: <span className="font-medium">${suggestedPrice.toFixed(2)}</span>{' '}
              <button
                type="button"
                onClick={() => setPriceInput(suggestedPrice.toFixed(2))}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Usar sugerido
              </button>
            </p>
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
              type="button"
              onClick={handleSubmit}
              disabled={mutation.isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              {mutation.isPending ? 'Creando...' : 'Crear artículo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
