'use client';

import { resolveUploadUrl } from '@/lib/inventory';
import { cartApi, CART_QUERY_KEY } from '@/lib/inventoryCart';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBasket } from 'lucide-react';
import { useState } from 'react';

export interface CatalogCardRow {
  articleId: string;
  articleName: string;
  categoryName: string | null;
  imageUrl: string | null;
  variantId: string;
  sku: string;
  variantLabel: string | null;
  unitPrice: number;
  totalStock: number;
}

/** Ecommerce-style browsing grid over the same filtered/sorted rows the
 * table view already computes (InventoryPage owns search/category/service/
 * published filtering) - this is purely a different rendering of the same
 * data, so it stays a dumb presentational component, no query of its own. */
export default function ArticleCatalogGrid({ rows }: { rows: CatalogCardRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-slate-400 dark:text-slate-600">
        Sin artículos que coincidan con la búsqueda
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {rows.map((row) => (
        <ArticleCard key={row.variantId} row={row} />
      ))}
    </div>
  );
}

function ArticleCard({ row }: { row: CatalogCardRow }) {
  const queryClient = useQueryClient();
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const addItem = useMutation({
    mutationFn: () => cartApi.addItem({ articleVariantId: row.variantId, quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_QUERY_KEY });
      setJustAdded(true);
      setQuantity(1);
      setTimeout(() => setJustAdded(false), 1500);
    },
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900">
      <div className="flex h-28 items-center justify-center bg-slate-200 dark:bg-slate-800">
        {row.imageUrl ? (
          <img src={resolveUploadUrl(row.imageUrl) ?? undefined} alt="" className="h-full w-full object-cover" />
        ) : (
          <ShoppingBasket className="h-8 w-8 text-slate-400 dark:text-slate-600" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        {row.categoryName && (
          <span className="w-fit rounded-full bg-slate-200 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-400">
            {row.categoryName}
          </span>
        )}
        <p className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">{row.articleName}</p>
        {row.variantLabel && <p className="text-xs text-slate-500 dark:text-slate-400">{row.variantLabel}</p>}
        <p className="text-xs text-slate-500 dark:text-slate-400">{row.sku}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            ${row.unitPrice.toFixed(2)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">Stock: {row.totalStock}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-14 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-center text-sm"
            aria-label="Cantidad"
          />
          <button
            onClick={() => addItem.mutate()}
            disabled={addItem.isPending}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium text-white transition ${
              justAdded ? 'bg-green-600' : 'bg-indigo-600 hover:bg-indigo-700'
            } disabled:opacity-50`}
          >
            {justAdded ? 'Agregado ✓' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  );
}
