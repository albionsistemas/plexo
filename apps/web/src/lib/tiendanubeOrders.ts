import { api } from '@/lib/api';

export type TiendanubeOrderStatus = 'PENDING_REVIEW' | 'CONVERTED' | 'ERROR';
export type ConvertTiendanubeOrderMode = 'INVOICE' | 'WITHOUT_INVOICE';

export interface TiendanubeOrderLineItem {
  sku: string | null;
  name: string;
  quantity: number;
  unitPrice: string;
  articleVariantId: string | null;
}

// Espeja TiendanubeOrder tal cual lo devuelve la API (con customer
// incluido - ver TiendanubeOrdersService.list) - sin envolver en otro tipo.
export interface TiendanubeOrder {
  id: string;
  tiendanubeOrderId: string;
  tiendanubeOrderNumber: number | null;
  status: TiendanubeOrderStatus;
  reviewReason: string | null;
  customer: { id: string; name: string };
  contactName: string | null;
  contactEmail: string | null;
  currency: string;
  total: string;
  lineItems: TiendanubeOrderLineItem[];
  convertedAt: string | null;
  convertedInvoiceId: string | null;
  createdAt: string;
}

export interface ConvertTiendanubeOrderInput {
  mode: ConvertTiendanubeOrderMode;
  warehouseId: string;
  branchId?: string;
  documentLetter?: 'A' | 'B' | 'C' | 'M';
}

const STATUS_LABELS: Record<TiendanubeOrderStatus, string> = {
  PENDING_REVIEW: 'En revisión',
  CONVERTED: 'Convertida',
  ERROR: 'Error',
};

const STATUS_COLORS: Record<TiendanubeOrderStatus, string> = {
  PENDING_REVIEW: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300',
  CONVERTED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  ERROR: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
};

export function describeTiendanubeOrderStatus(status: TiendanubeOrderStatus): { label: string; colorClass: string } {
  return { label: STATUS_LABELS[status], colorClass: STATUS_COLORS[status] };
}

/** SKUs sin mapear que bloquean la conversión - deriva del propio
 * lineItems, no de reviewReason (que también puede describir líneas sin
 * SKU cargado, que es lo mismo: articleVariantId null). */
export function unmappedSkus(order: TiendanubeOrder): string[] {
  return order.lineItems.filter((line) => !line.articleVariantId).map((line) => line.sku ?? '(sin SKU)');
}

export const tiendanubeOrdersApi = {
  list: () => api.get<TiendanubeOrder[]>('/connectors/tiendanube/orders').then((r) => r.data),
  convert: (id: string, dto: ConvertTiendanubeOrderInput) =>
    api.post<TiendanubeOrder>(`/connectors/tiendanube/orders/${id}/convert`, dto).then((r) => r.data),
};
