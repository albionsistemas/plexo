'use client';

import { inventoryApi, type Article } from '@/lib/inventory';
import { getSocket } from '@/lib/socket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import StockMovementModal from './StockMovementModal';

interface VariantRow {
  articleId: string;
  articleName: string;
  categoryId: string | null;
  categoryName: string | null;
  variantId: string;
  sku: string;
  variantLabel: string | null;
  unitPrice: number;
  totalStock: number;
  stockByWarehouseId: Record<string, number>;
}

function flattenVariants(articles: Article[]): VariantRow[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => ({
      articleId: article.id,
      articleName: article.name,
      categoryId: article.categoryId,
      categoryName: article.categoryName,
      variantId: variant.id,
      sku: variant.sku,
      variantLabel: [variant.color, variant.size, variant.brand].filter(Boolean).join(' / ') || null,
      unitPrice: variant.unitPrice,
      totalStock: variant.totalStock,
      stockByWarehouseId: Object.fromEntries(
        variant.stockByWarehouse.map((row) => [row.warehouseId, row.quantity]),
      ),
    })),
  );
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    queryFn: inventoryApi.listArticles,
  });
  const warehousesQuery = useQuery({
    queryKey: ['inventory-warehouses'],
    queryFn: inventoryApi.listWarehouses,
  });
  const categoriesQuery = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: inventoryApi.listCategories,
  });

  useEffect(() => {
    const socket = getSocket();
    socket.on('stock.updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-articles'] });
    });
    return () => {
      socket.off('stock.updated');
    };
  }, [queryClient]);

  const articles = articlesQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return flattenVariants(articles).filter((row) => {
      const matchesSearch =
        normalizedSearch === '' ||
        row.articleName.toLowerCase().includes(normalizedSearch) ||
        row.sku.toLowerCase().includes(normalizedSearch);
      const matchesCategory = categoryId === '' || row.categoryId === categoryId;
      return matchesSearch && matchesCategory;
    });
  }, [articles, search, categoryId]);

  const isLoading = articlesQuery.isLoading || warehousesQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Inventario</h1>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} variante{rows.length !== 1 ? 's' : ''} · {warehouses.length} depósito
            {warehouses.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          + Nuevo movimiento
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por artículo o SKU..."
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500 sm:max-w-sm"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-slate-500">
            Cargando inventario...
          </div>
        ) : articlesQuery.error ? (
          <div className="flex h-40 items-center justify-center text-red-400">
            Error al cargar el inventario
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-slate-600">
            Sin artículos que coincidan con la búsqueda
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-4">Artículo</th>
                  <th className="pb-2 pr-4">SKU</th>
                  <th className="pb-2 pr-4">Categoría</th>
                  <th className="pb-2 pr-4 text-right">Precio</th>
                  {warehouses.map((w) => (
                    <th key={w.id} className="pb-2 pr-4 text-right">
                      {w.name}
                    </th>
                  ))}
                  <th className="pb-2 pr-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.variantId}
                    className="border-b border-slate-800/50 hover:bg-slate-800/40"
                  >
                    <td className="py-2 pr-4">
                      <p className="text-slate-200">{row.articleName}</p>
                      {row.variantLabel && (
                        <p className="text-xs text-slate-500">{row.variantLabel}</p>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">{row.sku}</td>
                    <td className="py-2 pr-4 text-slate-400">{row.categoryName ?? '—'}</td>
                    <td className="py-2 pr-4 text-right text-slate-200">
                      ${row.unitPrice.toFixed(2)}
                    </td>
                    {warehouses.map((w) => (
                      <td key={w.id} className="py-2 pr-4 text-right text-slate-300">
                        {row.stockByWarehouseId[w.id] ?? 0}
                      </td>
                    ))}
                    <td className="py-2 pr-4 text-right font-semibold text-indigo-400">
                      {row.totalStock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <StockMovementModal
          articles={articles}
          warehouses={warehouses}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
