'use client';

import { inventoryApi, resolveUploadUrl, type Article } from '@/lib/inventory';
import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ShoppingBasket } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface ArticlePickerOption {
  id: string; // articleVariantId
  articleName: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  categoryName: string | null;
  unitPrice: number;
  totalStock: number;
  minimumStock: number | null;
}

function flattenOptions(articles: Article[]): ArticlePickerOption[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => ({
      id: variant.id,
      articleName: article.name,
      variantLabel: [variant.color, variant.size, variant.brand].filter(Boolean).join(' / ') || null,
      sku: variant.sku,
      imageUrl: article.imageUrl,
      categoryName: article.categoryName,
      unitPrice: variant.unitPrice,
      totalStock: variant.totalStock,
      minimumStock: variant.minimumStock,
    })),
  );
}

interface ArticlePickerProps {
  value: string;
  onChange: (variantId: string, option: ArticlePickerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Selector de artículo/variante compartido, con búsqueda por nombre/SKU e
 * imagen/stock por opción — reemplaza el <select> nativo que 6 formularios
 * distintos (Factura, Cotización, Orden de Compra, Pedido de Cotización x2,
 * Ajuste de Stock) reimplementaban cada uno con su propio flatMap. Reusa la
 * misma queryKey/queryFn que ya usaban esos 6 sitios y `ArticleCatalogGrid`
 * (React Query dedupea la request), así que sumar este picker a un form más
 * no agrega ningún pedido nuevo al backend. Sólo resuelve "elegir variante"
 * - cada caller sigue completando cantidad/precio/costo en sus propios
 * inputs, ya que eso difiere de formulario a formulario (auto-fill de
 * precio en Cotización, costo obligatorio en Orden de Compra, sin costo en
 * Pedido de Cotización grupal, etc.). */
export default function ArticlePicker({
  value,
  onChange,
  placeholder,
  disabled,
  className,
}: ArticlePickerProps) {
  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: () => inventoryApi.listArticles(),
  });
  const [query, setQuery] = useState('');

  const options = useMemo(() => flattenOptions(articlesQuery.data ?? []), [articlesQuery.data]);
  const selected = options.find((o) => o.id === value) ?? null;
  const isEmpty = !articlesQuery.isLoading && options.length === 0;

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized === '') return options;
    return options.filter(
      (o) => o.articleName.toLowerCase().includes(normalized) || o.sku.toLowerCase().includes(normalized),
    );
  }, [options, query]);

  return (
    <Combobox
      value={value || null}
      onChange={(id: string | null) => onChange(id ?? '', id ? (options.find((o) => o.id === id) ?? null) : null)}
      disabled={disabled || isEmpty}
    >
      <div className={`relative ${className ?? ''}`}>
        <div className="relative">
          <ComboboxInput
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 py-2 pl-3 pr-8 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 disabled:opacity-70"
            displayValue={() =>
              selected
                ? `${selected.sku} — ${selected.articleName}${selected.variantLabel ? ` (${selected.variantLabel})` : ''}`
                : ''
            }
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isEmpty ? 'Sin artículos cargados' : (placeholder ?? 'Buscar artículo o SKU...')}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
            <ChevronDown className="h-4 w-4" />
          </ComboboxButton>
        </div>
        <ComboboxOptions
          anchor="bottom start"
          className="z-[60] mt-1 max-h-72 w-[var(--input-width)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-1 shadow-xl focus:outline-none"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">Sin artículos que coincidan</p>
          ) : (
            filtered.map((option) => {
              const belowMinimum = option.minimumStock !== null && option.totalStock < option.minimumStock;
              return (
                <ComboboxOption
                  key={option.id}
                  value={option.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm data-[focus]:bg-slate-100 dark:data-[focus]:bg-slate-800"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                    {option.imageUrl ? (
                      <img
                        src={resolveUploadUrl(option.imageUrl) ?? undefined}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ShoppingBasket className="h-4 w-4 text-slate-400 dark:text-slate-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-slate-900 dark:text-slate-100">
                      {option.articleName}
                      {option.variantLabel && <span className="text-slate-500"> · {option.variantLabel}</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{option.sku}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-slate-700 dark:text-slate-300">${option.unitPrice.toFixed(2)}</p>
                    <p className={`text-xs ${belowMinimum ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}`}>
                      Stock: {option.totalStock}
                    </p>
                  </div>
                </ComboboxOption>
              );
            })
          )}
        </ComboboxOptions>
      </div>
    </Combobox>
  );
}
