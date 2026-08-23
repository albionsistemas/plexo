'use client';

import CompanyFormModal from '@/components/CompanyFormModal';
import { companiesApi } from '@/lib/companies';
import { inventoryApi, UNIT_OF_MEASURE_OPTIONS } from '@/lib/inventory';
import { tenantSettingsApi } from '@/lib/tenantSettings';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useEffect, useState } from 'react';

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

type Tab = 'general' | 'pricing' | 'variant' | 'stock' | 'media';

const inputClass =
  'rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500';

function tabClass(active: boolean): string {
  return `rounded-lg px-3 py-1.5 text-xs font-medium transition ${
    active
      ? 'bg-indigo-600 text-white'
      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
  }`;
}

/** Crear un artículo de punta a punta: Article + su primera
 * ArticleVariant/SKU + (opcional) MinimumStock + movimiento de stock
 * inicial + adjuntos - hasta la sesión anterior sólo se creaba
 * Article+Variant con los campos mínimos, el resto (categoría,
 * proveedor, stock inicial, imagen/folleto/zip) sólo se podía cargar
 * después editando desde la tabla de Inventario. Vive en components/ (no
 * app/inventory/) porque ArticlePicker (también components/) necesita
 * abrirlo desde cualquier formulario, no sólo desde Inventario - mismo
 * criterio que CompanyFormModal.
 *
 * `preferredSupplierId`/`markupPercent` no existen en el DTO de alta del
 * backend (`CreateArticleDto`) - sólo en el de edición
 * (`UpdateArticleDto`) - así que van en un PATCH aparte después de crear
 * el Article, no en el POST inicial (mandarlos ahí se descartaba en
 * silencio, sin error, en la versión anterior de este modal).
 */
export default function ArticleFormModal({ onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ['tenant-settings'], queryFn: tenantSettingsApi.get });
  const categoriesQuery = useQuery({ queryKey: ['inventory-categories'], queryFn: inventoryApi.listCategories });
  const warehousesQuery = useQuery({ queryKey: ['inventory-warehouses'], queryFn: inventoryApi.listWarehouses });
  const suppliersQuery = useQuery({ queryKey: ['companies', 'SUPPLIER'], queryFn: () => companiesApi.list('SUPPLIER') });

  const [tab, setTab] = useState<Tab>('general');

  // Datos generales
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [isService, setIsService] = useState(false);
  const [isPublished, setIsPublished] = useState(true);

  // Precios y proveedor
  const [preferredSupplierId, setPreferredSupplierId] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [costInput, setCostInput] = useState('');
  const [markupInput, setMarkupInput] = useState('');
  const [priceInput, setPriceInput] = useState('');

  // Variante / identificación
  const [sku, setSku] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState<string>('UNIT');

  // Stock inicial y alertas
  const [warehouseId, setWarehouseId] = useState('');
  const [stockInput, setStockInput] = useState('');
  const [minimumStockInput, setMinimumStockInput] = useState('');

  // Adjuntos - se suben recién después de crear el artículo (necesitan
  // su id), así que hasta entonces sólo quedan guardados acá.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);

  const [error, setError] = useState('');

  // Precarga el único depósito si hay uno solo - el caso más común, evita
  // un click extra sin forzar nada cuando hay más de uno.
  useEffect(() => {
    const warehouses = warehousesQuery.data;
    if (warehouseId === '' && warehouses?.length === 1) {
      setWarehouseId(warehouses[0].id);
    }
  }, [warehousesQuery.data, warehouseId]);

  // Si se activa "Es servicio" mientras se estaba mirando la pestaña de
  // stock (que deja de existir), no se queda en una pestaña fantasma.
  useEffect(() => {
    if (isService && tab === 'stock') setTab('general');
  }, [isService, tab]);

  const defaultMarkup = settingsQuery.data?.defaultMarkupPercent;
  const effectiveMarkup = markupInput.trim() !== '' ? Number(markupInput) : defaultMarkup;
  const suggestedPrice =
    costInput.trim() !== '' && effectiveMarkup != null && !Number.isNaN(effectiveMarkup)
      ? Number(costInput) * (1 + effectiveMarkup / 100)
      : null;

  const categories = categoriesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const suppliers = suppliersQuery.data ?? [];

  const stockQuantity = stockInput.trim() === '' ? 0 : Number(stockInput);
  const minimumQuantity = minimumStockInput.trim() === '' ? 0 : Number(minimumStockInput);

  const createCategoryMutation = useMutation({
    mutationFn: () => inventoryApi.createCategory({ name: newCategoryName.trim() }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      setCategoryId(created.id);
      setNewCategoryName('');
      setCreatingCategory(false);
    },
    onError: (err: AxiosError<{ message?: string | string[] }>) => {
      const message = err.response?.data?.message ?? 'No se pudo crear la categoría';
      setError(Array.isArray(message) ? message.join(', ') : message);
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const article = await inventoryApi.createArticle({
        name: name.trim(),
        unitOfMeasure,
        description: description.trim() || undefined,
        categoryId: categoryId || undefined,
        isService,
        isPublished,
      });

      if (preferredSupplierId || markupInput.trim() !== '') {
        await inventoryApi.updateArticle(article.id, {
          preferredSupplierId: preferredSupplierId || null,
          markupPercent: markupInput.trim() === '' ? null : Number(markupInput),
        });
      }

      const variant = await inventoryApi.createArticleVariant({
        articleId: article.id,
        sku: sku.trim(),
        unitPrice: Number(priceInput),
        costPrice: costInput.trim() === '' ? undefined : Number(costInput),
      });

      if (!isService && warehouseId) {
        if (minimumQuantity > 0) {
          await inventoryApi.setMinimumStock({
            warehouseId,
            articleVariantId: variant.id,
            minimumQuantity,
          });
        }
        if (stockQuantity > 0) {
          await inventoryApi.recordMovement({
            warehouseId,
            articleVariantId: variant.id,
            type: 'PURCHASE_IN',
            quantity: stockQuantity,
            unitCost: Number(costInput),
          });
        }
      }

      await Promise.all([
        imageFile ? inventoryApi.uploadArticleImage(article.id, imageFile) : null,
        brochureFile ? inventoryApi.uploadArticleBrochure(article.id, brochureFile) : null,
        zipFile ? inventoryApi.uploadArticleAttachmentZip(article.id, zipFile) : null,
      ]);

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
  // que a su vez vive DENTRO del <form> de cada uno de los formularios que
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
      setTab('general');
      return;
    }
    if (!sku.trim()) {
      setError('Ingresá un SKU');
      setTab('variant');
      return;
    }
    if (priceInput.trim() === '' || Number(priceInput) <= 0) {
      setError('Ingresá un precio de venta válido');
      setTab('pricing');
      return;
    }
    if (!isService) {
      if ((stockQuantity > 0 || minimumQuantity > 0) && !warehouseId) {
        setError('Elegí un depósito para el stock inicial o el mínimo');
        setTab('stock');
        return;
      }
      if (stockQuantity > 0 && costInput.trim() === '') {
        setError('Ingresá el costo inicial para poder registrar el stock inicial');
        setTab('pricing');
        return;
      }
    }
    mutation.mutate();
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'general', label: 'Datos generales' },
    { key: 'pricing', label: 'Precios y proveedor' },
    { key: 'variant', label: 'Variante' },
    ...(isService ? [] : [{ key: 'stock' as const, label: 'Stock inicial' }]),
    { key: 'media', label: 'Adjuntos' },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Nuevo artículo</h2>
          <button onClick={onClose} className="text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300">
            ✕
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={tabClass(tab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {tab === 'general' && (
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

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Categoría</span>
                  {!creatingCategory && (
                    <button
                      type="button"
                      onClick={() => setCreatingCategory(true)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                    >
                      + nueva categoría
                    </button>
                  )}
                </div>
                {creatingCategory ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className={`${inputClass} flex-1`}
                      placeholder="Nombre de la categoría"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => createCategoryMutation.mutate()}
                      disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {createCategoryMutation.isPending ? 'Creando...' : 'Crear'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreatingCategory(false);
                        setNewCategoryName('');
                      }}
                      className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={`${inputClass} w-full`}>
                    <option value="">— Sin categoría —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">Descripción</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder="Opcional - detalle visible al editar el artículo"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Es servicio
                  <span className="block text-xs text-slate-500">No lleva stock ni depósito</span>
                </span>
                <input
                  type="checkbox"
                  checked={isService}
                  onChange={(e) => setIsService(e.target.checked)}
                  className="h-5 w-5 accent-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Publicado
                  <span className="block text-xs text-slate-500">Visible en el catálogo</span>
                </span>
                <input
                  type="checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="h-5 w-5 accent-indigo-600"
                />
              </label>
            </div>
          )}

          {tab === 'pricing' && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Proveedor preferido</span>
                  <button
                    type="button"
                    onClick={() => setCreatingSupplier(true)}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                  >
                    + nuevo proveedor
                  </button>
                </div>
                <select
                  value={preferredSupplierId}
                  onChange={(e) => setPreferredSupplierId(e.target.value)}
                  className={`${inputClass} w-full`}
                >
                  <option value="">— Ninguno —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
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
            </div>
          )}

          {tab === 'variant' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">SKU</span>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={inputClass}
                  placeholder="p. ej. AGUA-500 - podés escanear el código de barras acá"
                />
              </label>
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
            </div>
          )}

          {tab === 'stock' && !isService && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">Depósito inicial</span>
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
                  <option value="">— Elegir depósito —</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Stock inicial</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={stockInput}
                    onChange={(e) => setStockInput(e.target.value)}
                    className={inputClass}
                    placeholder="0"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Stock mínimo para alertas</span>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={minimumStockInput}
                    onChange={(e) => setMinimumStockInput(e.target.value)}
                    className={inputClass}
                    placeholder="Opcional"
                  />
                </label>
              </div>
              {stockQuantity > 0 && (
                <p className="text-xs text-slate-500">
                  Se registra como un movimiento de compra (entrada) - por eso necesita el costo inicial cargado
                  en &quot;Precios y proveedor&quot;.
                </p>
              )}
            </div>
          )}

          {tab === 'media' && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">Imagen principal</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 dark:text-slate-300"
                />
                {imageFile && <span className="text-xs text-slate-500">{imageFile.name}</span>}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">Folleto (PDF)</span>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setBrochureFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 dark:text-slate-300"
                />
                {brochureFile && <span className="text-xs text-slate-500">{brochureFile.name}</span>}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">Adjunto (ZIP)</span>
                <input
                  type="file"
                  accept=".zip,application/zip,application/x-zip-compressed"
                  onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-700 dark:text-slate-300"
                />
                {zipFile && <span className="text-xs text-slate-500">{zipFile.name}</span>}
              </label>
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-3 border-t border-slate-200 dark:border-slate-800 pt-4">
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

      {creatingSupplier && (
        <CompanyFormModal
          lockedRole="SUPPLIER"
          onClose={() => setCreatingSupplier(false)}
          onSaved={(c) => setPreferredSupplierId(c.id)}
        />
      )}
    </div>
  );
}
