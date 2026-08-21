'use client';

import { inventoryApi, resolveUploadUrl, type Article } from '@/lib/inventory';
import { getSocket } from '@/lib/socket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LayoutGrid, List } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ArticleCatalogGrid from './ArticleCatalogGrid';
import ArticleImageModal from './ArticleImageModal';
import ArticlePriceHistoryModal from './ArticlePriceHistoryModal';
import ArticleSupplierModal from './ArticleSupplierModal';
import ImportArticlesModal from './ImportArticlesModal';
import StockAlertsPanel from './StockAlertsPanel';
import StockMovementModal from './StockMovementModal';

interface VariantRow {
  articleId: string;
  articleName: string;
  categoryId: string | null;
  categoryName: string | null;
  isService: boolean;
  isPublished: boolean;
  imageUrl: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  variantId: string;
  sku: string;
  variantLabel: string | null;
  unitPrice: number;
  totalStock: number;
  minimumStock: number | null;
  stockByWarehouseId: Record<string, number>;
}

type SortKey = 'articleName' | 'sku' | 'categoryName' | 'unitPrice' | 'totalStock' | 'minimumStock';
type SortDirection = 'asc' | 'desc';

function compareRows(a: VariantRow, b: VariantRow, key: SortKey): number {
  const av = a[key];
  const bv = b[key];
  if (av === null) return bv === null ? 0 : 1;
  if (bv === null) return -1;
  if (typeof av === 'string' && typeof bv === 'string') {
    return av.localeCompare(bv, 'es');
  }
  return (av as number) - (bv as number);
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  currentSort: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = currentSort.key === sortKey;
  return (
    <th className={`pb-2 pr-4 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-300 ${
          isActive ? 'text-slate-700 dark:text-slate-300' : ''
        }`}
      >
        {label}
        <span className="text-[10px] leading-none">
          {isActive ? (currentSort.direction === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      </button>
    </th>
  );
}

function flattenVariants(articles: Article[]): VariantRow[] {
  return articles.flatMap((article) =>
    article.variants.map((variant) => ({
      articleId: article.id,
      articleName: article.name,
      categoryId: article.categoryId,
      categoryName: article.categoryName,
      isService: article.isService,
      isPublished: article.isPublished,
      imageUrl: article.imageUrl,
      preferredSupplierId: article.preferredSupplierId,
      preferredSupplierName: article.preferredSupplierName,
      variantId: variant.id,
      sku: variant.sku,
      variantLabel: [variant.color, variant.size, variant.brand].filter(Boolean).join(' / ') || null,
      unitPrice: variant.unitPrice,
      totalStock: variant.totalStock,
      minimumStock: variant.minimumStock,
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
  const [onlyServices, setOnlyServices] = useState(false);
  const [onlyPublished, setOnlyPublished] = useState(false);
  const [view, setView] = useState<'table' | 'catalog' | 'alerts'>('table');
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [imageArticle, setImageArticle] = useState<{ id: string; name: string; imageUrl: string | null } | null>(
    null,
  );
  const [supplierArticle, setSupplierArticle] = useState<
    { id: string; name: string; preferredSupplierId: string | null } | null
  >(null);
  const [historyVariant, setHistoryVariant] = useState<
    { id: string; sku: string; articleName: string } | null
  >(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'articleName',
    direction: 'asc',
  });

  const handleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const articlesQuery = useQuery({
    queryKey: ['inventory-articles'],
    // Client-side filtering below already handles search/category/service/
    // published (see the `rows` useMemo) - not wiring those into the query
    // key here, that would need debouncing to avoid a refetch per
    // keystroke over a dataset this page already has in full.
    queryFn: () => inventoryApi.listArticles(),
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
    const filtered = flattenVariants(articles).filter((row) => {
      const matchesSearch =
        normalizedSearch === '' ||
        row.articleName.toLowerCase().includes(normalizedSearch) ||
        row.sku.toLowerCase().includes(normalizedSearch);
      const matchesCategory = categoryId === '' || row.categoryId === categoryId;
      const matchesService = !onlyServices || row.isService;
      const matchesPublished = !onlyPublished || row.isPublished;
      return matchesSearch && matchesCategory && matchesService && matchesPublished;
    });
    const sorted = filtered.sort((a, b) => compareRows(a, b, sort.key));
    return sort.direction === 'asc' ? sorted : sorted.reverse();
  }, [articles, search, categoryId, onlyServices, onlyPublished, sort]);

  const isLoading = articlesQuery.isLoading || warehousesQuery.isLoading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Inventario</h1>
          <p className="mt-1 text-xs text-slate-500">
            {rows.length} variante{rows.length !== 1 ? 's' : ''} · {warehouses.length} depósito
            {warehouses.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setImportModalOpen(true)}
            className="rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 transition hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            Importar desde Excel
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            + Nuevo movimiento
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por artículo o SKU..."
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500 sm:max-w-sm"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={onlyServices}
            onChange={(e) => setOnlyServices(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Sólo servicios
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={onlyPublished}
            onChange={(e) => setOnlyPublished(e.target.checked)}
            className="h-4 w-4 accent-indigo-600"
          />
          Sólo publicados
        </label>
        <div className="flex gap-1 rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 sm:ml-auto">
          <button
            onClick={() => setView('table')}
            title="Vista de lista"
            aria-label="Vista de lista"
            className={`flex h-7 w-7 items-center justify-center rounded ${
              view === 'table'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('catalog')}
            title="Vista de catálogo"
            aria-label="Vista de catálogo"
            className={`flex h-7 w-7 items-center justify-center rounded ${
              view === 'catalog'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('alerts')}
            title="Alertas de stock"
            aria-label="Alertas de stock"
            className={`flex h-7 w-7 items-center justify-center rounded ${
              view === 'alerts'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-4">
        {view === 'alerts' ? (
          <StockAlertsPanel />
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center text-slate-500">
            Cargando inventario...
          </div>
        ) : articlesQuery.error ? (
          <div className="flex h-40 items-center justify-center text-red-600 dark:text-red-400">
            Error al cargar el inventario
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-slate-400 dark:text-slate-600">
            Sin artículos que coincidan con la búsqueda
          </div>
        ) : view === 'catalog' ? (
          <ArticleCatalogGrid
            rows={rows.map((row) => ({
              articleId: row.articleId,
              articleName: row.articleName,
              categoryName: row.categoryName,
              imageUrl: row.imageUrl,
              variantId: row.variantId,
              sku: row.sku,
              variantLabel: row.variantLabel,
              unitPrice: row.unitPrice,
              totalStock: row.totalStock,
            }))}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs text-slate-500">
                  <th className="pb-2 pr-2" />
                  <SortableHeader label="Artículo" sortKey="articleName" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="SKU" sortKey="sku" currentSort={sort} onSort={handleSort} />
                  <SortableHeader label="Categoría" sortKey="categoryName" currentSort={sort} onSort={handleSort} />
                  <SortableHeader
                    label="Precio"
                    sortKey="unitPrice"
                    currentSort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  {warehouses.map((w) => (
                    <th key={w.id} className="pb-2 pr-4 text-right">
                      {w.name}
                    </th>
                  ))}
                  <SortableHeader
                    label="Total"
                    sortKey="totalStock"
                    currentSort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Stock mínimo"
                    sortKey="minimumStock"
                    currentSort={sort}
                    onSort={handleSort}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const belowMinimum = row.minimumStock !== null && row.totalStock < row.minimumStock;
                  return (
                    <tr
                      key={row.variantId}
                      className={`border-b border-slate-200/50 dark:border-slate-800/50 hover:bg-slate-200/40 dark:hover:bg-slate-800/40 ${
                        belowMinimum ? 'bg-red-50 dark:bg-red-950/30' : ''
                      }`}
                    >
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() =>
                            setImageArticle({ id: row.articleId, name: row.articleName, imageUrl: row.imageUrl })
                          }
                          title="Imagen del artículo"
                          className="block h-8 w-8 overflow-hidden rounded border border-slate-300 dark:border-slate-700"
                        >
                          {row.imageUrl ? (
                            <img
                              src={resolveUploadUrl(row.imageUrl) ?? undefined}
                              alt=""
                              className="h-8 w-8 object-cover"
                            />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600">
                              <NoImageIcon />
                            </span>
                          )}
                        </button>
                      </td>
                      <td className="py-2 pr-4">
                        <p className="text-slate-800 dark:text-slate-200">{row.articleName}</p>
                        {row.variantLabel && (
                          <p className="text-xs text-slate-500">{row.variantLabel}</p>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSupplierArticle({
                              id: row.articleId,
                              name: row.articleName,
                              preferredSupplierId: row.preferredSupplierId,
                            })
                          }
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                        >
                          {row.preferredSupplierName ?? '+ proveedor'}
                        </button>
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs text-slate-600 dark:text-slate-400">{row.sku}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{row.categoryName ?? '—'}</td>
                      <td className="py-2 pr-4 text-right text-slate-800 dark:text-slate-200">
                        <button
                          type="button"
                          onClick={() =>
                            setHistoryVariant({ id: row.variantId, sku: row.sku, articleName: row.articleName })
                          }
                          title="Ver historial de precios"
                          className="hover:underline hover:decoration-dotted"
                        >
                          ${row.unitPrice.toFixed(2)}
                        </button>
                      </td>
                      {warehouses.map((w) => (
                        <td key={w.id} className="py-2 pr-4 text-right text-slate-700 dark:text-slate-300">
                          {row.stockByWarehouseId[w.id] ?? 0}
                        </td>
                      ))}
                      <td
                        className={`py-2 pr-4 text-right font-semibold ${
                          belowMinimum
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-indigo-600 dark:text-indigo-400'
                        }`}
                      >
                        {row.totalStock}
                        {belowMinimum && <span title="Por debajo del stock mínimo"> ⚠</span>}
                      </td>
                      <td className="py-2 pr-4 text-right text-slate-600 dark:text-slate-400">
                        {row.minimumStock ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <StockMovementModal warehouses={warehouses} onClose={() => setModalOpen(false)} />
      )}

      {importModalOpen && <ImportArticlesModal onClose={() => setImportModalOpen(false)} />}

      {imageArticle && <ArticleImageModal article={imageArticle} onClose={() => setImageArticle(null)} />}

      {supplierArticle && (
        <ArticleSupplierModal article={supplierArticle} onClose={() => setSupplierArticle(null)} />
      )}

      {historyVariant && (
        <ArticlePriceHistoryModal variant={historyVariant} onClose={() => setHistoryVariant(null)} />
      )}
    </div>
  );
}

function NoImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
      <path d="M3 3l18 18" />
    </svg>
  );
}
