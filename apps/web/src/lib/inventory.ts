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
  stockByWarehouse: WarehouseStockRow[];
}

export interface Article {
  id: string;
  name: string;
  description: string | null;
  unitOfMeasure: string;
  categoryId: string | null;
  categoryName: string | null;
  variants: ArticleVariant[];
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

export interface RecordStockMovementInput {
  warehouseId: string;
  articleVariantId: string;
  type: MovementType;
  quantity: number;
}

export const inventoryApi = {
  listArticles: () => api.get<Article[]>('/inventory/articles').then((r) => r.data),
  listWarehouses: () => api.get<Warehouse[]>('/inventory/warehouses').then((r) => r.data),
  listCategories: () => api.get<Category[]>('/inventory/categories').then((r) => r.data),
  recordMovement: (dto: RecordStockMovementInput) =>
    api.post('/inventory/movements', dto).then((r) => r.data),
};
