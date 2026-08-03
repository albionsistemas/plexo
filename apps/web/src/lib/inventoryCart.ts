import { api } from '@/lib/api';

// Query key shared by every consumer (CartButton's badge, CartDrawer, the
// catalog grid's "Agregar" mutations) so a single React Query cache entry
// stays in sync everywhere without a global store - same convention this
// codebase already uses (React Query only, no Redux/Zustand).
export const CART_QUERY_KEY = ['inventory-cart'] as const;

export interface CartLine {
  id: string;
  articleVariantId: string;
  articleId: string;
  articleName: string;
  sku: string;
  imageUrl: string | null;
  categoryName: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string | null;
}

export interface AddCartItemInput {
  articleVariantId: string;
  quantity: number;
  notes?: string;
}

export interface PurchaseRequestGroupLineInput {
  articleVariantId: string;
  quantity: number;
  estimatedUnitCost?: number;
}

export interface PurchaseRequestGroupInput {
  supplierId: string;
  currencyId: string;
  notes?: string;
  lines: PurchaseRequestGroupLineInput[];
}

export interface CheckoutQuoteLineInput {
  articleVariantId: string;
  quantity: number;
  unitPrice: number;
}

export interface CheckoutQuoteInput {
  customerId: string;
  currencyId: string;
  validUntil?: string;
  notes?: string;
  lines: CheckoutQuoteLineInput[];
}

export const cartApi = {
  list: () => api.get<CartLine[]>('/inventory/cart').then((r) => r.data),
  addItem: (dto: AddCartItemInput) => api.post<CartLine>('/inventory/cart', dto).then((r) => r.data),
  updateQuantity: (id: string, quantity: number) =>
    api.patch<CartLine>(`/inventory/cart/${id}`, { quantity }).then((r) => r.data),
  removeItem: (id: string) => api.delete(`/inventory/cart/${id}`).then((r) => r.data),
  clear: () => api.delete('/inventory/cart').then((r) => r.data),
  openPdf: async () => {
    const res = await api.get('/inventory/cart/pdf', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
  },
};

export const cartCheckoutApi = {
  purchaseRequests: (groups: PurchaseRequestGroupInput[]) =>
    api.post('/inventory/cart/checkout/purchase-requests', { groups }).then((r) => r.data),
  quote: (dto: CheckoutQuoteInput) =>
    api.post('/inventory/cart/checkout/quote', dto).then((r) => r.data),
};
