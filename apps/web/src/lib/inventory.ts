import { api } from '@/lib/api';

export interface Warehouse {
  id: string;
  name: string;
  location: string | null;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

export interface WarehouseStockRow {
  warehouseId: string;
  warehouseName: string;
  quantity: number;
}

export interface ArticleVariant {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  brand: string | null;
  unitPrice: number;
  totalStock: number;
  minimumStock: number | null;
  stockByWarehouse: WarehouseStockRow[];
}

export interface Article {
  id: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  isService: boolean;
  isPublished: boolean;
  imageUrl: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  variants: ArticleVariant[];
}

export interface UpdateArticleInput {
  isService?: boolean;
  isPublished?: boolean;
  // null clears it, undefined/omitted leaves it untouched.
  preferredSupplierId?: string | null;
}

/** Article images (and goods-receipt attachments, and Person avatars) are
 * served from @fastify/static at the API's root (`/uploads/...`), not under
 * the `/api` prefix everything else in `api` (axios instance) uses - strip
 * that suffix to get the plain origin. Person.avatarUrl is the one field
 * that can ALSO hold a value that never went through our own upload
 * endpoint at all - a URL (or data: URI) the user pasted directly - so
 * anything that already looks absolute passes through untouched instead of
 * getting the origin prepended onto it. */
export function resolveUploadUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  const origin = (api.defaults.baseURL ?? '').replace(/\/api\/?$/, '');
  return `${origin}${path}`;
}

export const MOVEMENT_TYPES = [
  { value: 'PURCHASE_IN', label: 'Compra (entrada)' },
  { value: 'SALE_OUT', label: 'Venta (salida)' },
  { value: 'RETURN', label: 'Devolución (entrada)' },
  { value: 'PRODUCTION_IN', label: 'Producción (entrada)' },
  { value: 'PRODUCTION_OUT', label: 'Producción (salida/consumo)' },
  { value: 'ADJUSTMENT', label: 'Ajuste manual (+/-)' },
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number]['value'];

// No purchaseOrderId here on purpose (2026-07-29) - linking a manual
// movement to a real Orden de Compra with no quantity/cost validation was
// exactly the bug "Recibir mercadería" (ReceiveGoodsModal) was built to
// close; the backend also rejects this field on POST /inventory/movements
// now (InventoryController.recordMovement), it's not just hidden here.
export interface RecordStockMovementInput {
  warehouseId: string;
  articleVariantId: string;
  type: MovementType;
  quantity: number;
  unitCost?: number;
}

export interface PriceHistoryEntry {
  id: string;
  unitPrice: string;
  costPrice: string | null;
  effectiveAt: string;
  purchaseOrderId: string | null;
  purchaseOrderNumber: string | null;
}

export interface ImportRowError {
  row: number;
  sku?: string;
  message: string;
}

export interface ImportResult {
  created: number;
  errors: ImportRowError[];
}

export interface ListArticlesFilters {
  search?: string;
  categoryId?: string;
  isPublished?: boolean;
}

export interface ReorderSuggestion {
  warehouseId: string;
  warehouseName: string;
  articleVariantId: string;
  sku: string;
  articleName: string;
  variantLabel: string | null;
  imageUrl: string | null;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  minimumQuantity: number;
  currentQuantity: number;
  suggestedQuantity: number;
}

export const inventoryApi = {
  listArticles: (filters?: ListArticlesFilters) =>
    api.get<Article[]>('/inventory/articles', { params: filters }).then((r) => r.data),
  listWarehouses: () => api.get<Warehouse[]>('/inventory/warehouses').then((r) => r.data),
  listReorderSuggestions: () =>
    api.get<ReorderSuggestion[]>('/inventory/reorder-suggestions').then((r) => r.data),
  listCategories: () => api.get<Category[]>('/inventory/categories').then((r) => r.data),
  recordMovement: (dto: RecordStockMovementInput) =>
    api.post('/inventory/movements', dto).then((r) => r.data),
  downloadImportTemplate: async () => {
    const res = await api.get('/inventory/articles/import/template', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-articulos.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  importArticles: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<ImportResult>('/inventory/articles/import', formData)
      .then((r) => r.data);
  },
  uploadArticleImage: (articleId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<Article>(`/inventory/articles/${articleId}/image`, formData)
      .then((r) => r.data);
  },
  removeArticleImage: (articleId: string) =>
    api.delete<Article>(`/inventory/articles/${articleId}/image`).then((r) => r.data),
  updateArticle: (id: string, dto: UpdateArticleInput) =>
    api.patch<Article>(`/inventory/articles/${id}`, dto).then((r) => r.data),
  getPriceHistory: (articleVariantId: string) =>
    api
      .get<PriceHistoryEntry[]>(`/inventory/article-variants/${articleVariantId}/price-history`)
      .then((r) => r.data),
};
