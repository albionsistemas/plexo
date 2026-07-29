import { api } from '@/lib/api';

export type PurchaseDocumentStatus = 'DRAFT' | 'CONVERTED' | 'SENT' | 'CANCELLED';
export type PurchaseSendChannel = 'EMAIL' | 'WHATSAPP';
export type PdfStyle = 'MODERNO' | 'COMPACTO' | 'TRADICIONAL' | 'NATURAL' | 'LETRAS_GRANDES';

export const PDF_STYLES: { value: PdfStyle; label: string; description: string }[] = [
  { value: 'MODERNO', label: 'Moderno', description: 'Colores, encabezado destacado, look actual' },
  { value: 'COMPACTO', label: 'Compacto', description: 'Denso, ahorra espacio en pedidos largos' },
  { value: 'TRADICIONAL', label: 'Tradicional', description: 'Blanco y negro, formal, con firmas' },
  { value: 'NATURAL', label: 'Natural', description: 'Tonos cálidos, look amigable' },
  { value: 'LETRAS_GRANDES', label: 'Letras grandes', description: 'Máxima legibilidad, tipografía grande' },
];

export type CatalogRouteType = 'transport-modes' | 'payment-terms' | 'delivery-times';

export interface CatalogItem {
  id: string;
  name: string;
  active: boolean;
}

export interface CatalogRef {
  id: string;
  name: string;
}

export interface SupplierRef {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  fiscalAddress: string | null;
}

interface LineDetail {
  id: string;
  quantity: string;
  notes: string | null;
  articleVariant: { sku: string; article: { name: string } };
}

export interface QuoteRequestLineDetail extends LineDetail {
  estimatedUnitCost: string | null;
}

export interface PurchaseOrderLineDetail extends LineDetail {
  unitCost: string;
}

export interface QuoteRequestLineInput {
  articleVariantId: string;
  quantity: number;
  estimatedUnitCost?: number;
  notes?: string;
}

export interface PurchaseOrderLineInput {
  articleVariantId: string;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export interface LinkedPurchaseOrderRef {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  sentAt: string | null;
  sentVia: PurchaseSendChannel | null;
}

export interface QuoteRequestSummary {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  estimatedTotal: string | null;
  createdAt: string;
  supplier: { id: string; name: string };
  currency: { code: string };
  purchaseOrders: LinkedPurchaseOrderRef[];
}

export interface QuoteRequestDetail {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  estimatedTotal: string | null;
  notes: string | null;
  validUntil: string | null;
  createdAt: string;
  supplier: SupplierRef;
  currency: { id: string; code: string; name: string };
  transportMode: CatalogRef | null;
  paymentTerm: CatalogRef | null;
  deliveryTime: CatalogRef | null;
  lines: QuoteRequestLineDetail[];
  purchaseOrders: LinkedPurchaseOrderRef[];
}

/** DRAFT/CANCELLED map straight to their own label. CONVERTED splits in
 * two depending on the resulting Orden de Compra: "Comprado" once issued
 * but only saved, "Enviado" once that order was actually sent to the
 * supplier (email/WhatsApp) - the Pedido's own `status` enum has no SENT
 * value of its own, this derives it from the linked order instead of
 * duplicating sentAt/sentVia onto QuoteRequest. */
export function describeQuoteRequestStatus(qr: {
  status: PurchaseDocumentStatus;
  purchaseOrders: LinkedPurchaseOrderRef[];
}): { label: string; colorClass: string; purchaseOrder: LinkedPurchaseOrderRef | null } {
  if (qr.status === 'DRAFT') {
    return { label: 'Borrador', colorClass: STATUS_COLOR_CLASSES.DRAFT, purchaseOrder: null };
  }
  if (qr.status === 'CANCELLED') {
    return { label: 'Cancelado', colorClass: STATUS_COLOR_CLASSES.CANCELLED, purchaseOrder: null };
  }
  const purchaseOrder = qr.purchaseOrders[0] ?? null;
  return purchaseOrder?.sentAt
    ? { label: 'Enviado', colorClass: STATUS_COLOR_CLASSES.ENVIADO, purchaseOrder }
    : { label: 'Comprado', colorClass: STATUS_COLOR_CLASSES.COMPRADO, purchaseOrder };
}

const STATUS_COLOR_CLASSES = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
  COMPRADO: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  ENVIADO: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300',
} as const;

export interface PurchaseOrderSummary {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  total: string;
  sentAt: string | null;
  sentVia: PurchaseSendChannel | null;
  createdAt: string;
  supplier: { id: string; name: string };
  currency: { code: string };
  lines: { id: string }[];
}

export interface PurchaseOrderDetail {
  id: string;
  number: string;
  status: PurchaseDocumentStatus;
  total: string;
  notes: string | null;
  sentAt: string | null;
  sentVia: PurchaseSendChannel | null;
  createdAt: string;
  supplier: SupplierRef;
  currency: { id: string; code: string; name: string };
  transportMode: CatalogRef | null;
  paymentTerm: CatalogRef | null;
  deliveryTime: CatalogRef | null;
  quoteRequest: { id: string; number: string } | null;
  lines: PurchaseOrderLineDetail[];
}

export interface PurchasePreferences {
  quoteRequestPrefix: string;
  quoteRequestNextNumber: number;
  purchaseOrderPrefix: string;
  purchaseOrderNextNumber: number;
  purchaseDocumentPdfStyle: PdfStyle;
}

export interface CreateQuoteRequestInput {
  supplierId: string;
  currencyId: string;
  transportModeId?: string;
  paymentTermId?: string;
  deliveryTimeId?: string;
  validUntil?: string;
  notes?: string;
  lines: QuoteRequestLineInput[];
}

export interface CreatePurchaseOrderInput {
  supplierId: string;
  currencyId: string;
  transportModeId?: string;
  paymentTermId?: string;
  deliveryTimeId?: string;
  notes?: string;
  lines: PurchaseOrderLineInput[];
}

/** GET .../pdf needs the Authorization header, so a plain <a href> or
 * window.open(url) won't work (no way to attach a header to a bare
 * navigation) - fetch as a blob through axios (which does attach it via
 * the request interceptor) and open that instead. Same reasoning as
 * inventoryApi.downloadImportTemplate, but opened inline (window.open)
 * instead of force-downloaded, so the user can look at it before deciding
 * to save/print/send. */
async function openPdf(path: string, style?: PdfStyle): Promise<void> {
  const res = await api.get(path, {
    params: style ? { style } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export const catalogsApi = {
  list: (type: CatalogRouteType, includeInactive?: boolean) =>
    api
      .get<CatalogItem[]>(`/purchases/catalogs/${type}`, {
        params: includeInactive ? { includeInactive: 'true' } : {},
      })
      .then((r) => r.data),
  create: (type: CatalogRouteType, name: string) =>
    api.post<CatalogItem>(`/purchases/catalogs/${type}`, { name }).then((r) => r.data),
  update: (type: CatalogRouteType, id: string, dto: { name?: string; active?: boolean }) =>
    api.patch<CatalogItem>(`/purchases/catalogs/${type}/${id}`, dto).then((r) => r.data),
};

export const purchasePreferencesApi = {
  get: () => api.get<PurchasePreferences>('/purchases/preferences').then((r) => r.data),
  update: (
    dto: Partial<{
      quoteRequestPrefix: string;
      purchaseOrderPrefix: string;
      purchaseDocumentPdfStyle: PdfStyle;
    }>,
  ) => api.patch<PurchasePreferences>('/purchases/preferences', dto).then((r) => r.data),
};

export const quoteRequestsApi = {
  list: (status?: PurchaseDocumentStatus, supplierId?: string) =>
    api
      .get<QuoteRequestSummary[]>('/purchases/quote-requests', { params: { status, supplierId } })
      .then((r) => r.data),
  get: (id: string) => api.get<QuoteRequestDetail>(`/purchases/quote-requests/${id}`).then((r) => r.data),
  create: (dto: CreateQuoteRequestInput) =>
    api.post<QuoteRequestDetail>('/purchases/quote-requests', dto).then((r) => r.data),
  update: (id: string, dto: Partial<CreateQuoteRequestInput>) =>
    api.patch<QuoteRequestDetail>(`/purchases/quote-requests/${id}`, dto).then((r) => r.data),
  clone: (id: string) =>
    api.post<QuoteRequestDetail>(`/purchases/quote-requests/${id}/clone`).then((r) => r.data),
  convert: (id: string) =>
    api.post<PurchaseOrderDetail>(`/purchases/quote-requests/${id}/convert`).then((r) => r.data),
  cancel: (id: string) => api.patch(`/purchases/quote-requests/${id}/cancel`).then(() => undefined),
  openPdf: (id: string, style?: PdfStyle) => openPdf(`/purchases/quote-requests/${id}/pdf`, style),
};

export const purchaseOrdersApi = {
  list: (status?: PurchaseDocumentStatus, supplierId?: string) =>
    api
      .get<PurchaseOrderSummary[]>('/purchases/purchase-orders', { params: { status, supplierId } })
      .then((r) => r.data),
  get: (id: string) => api.get<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}`).then((r) => r.data),
  create: (dto: CreatePurchaseOrderInput) =>
    api.post<PurchaseOrderDetail>('/purchases/purchase-orders', dto).then((r) => r.data),
  update: (id: string, dto: Partial<CreatePurchaseOrderInput>) =>
    api.patch<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}`, dto).then((r) => r.data),
  cancel: (id: string) => api.patch(`/purchases/purchase-orders/${id}/cancel`).then(() => undefined),
  sendEmail: (id: string) =>
    api.post<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}/send-email`).then((r) => r.data),
  whatsappLink: (id: string, phone: string) =>
    api
      .get<{ url: string }>(`/purchases/purchase-orders/${id}/whatsapp-link`, { params: { phone } })
      .then((r) => r.data),
  markSentWhatsapp: (id: string) =>
    api.post<PurchaseOrderDetail>(`/purchases/purchase-orders/${id}/mark-sent-whatsapp`).then((r) => r.data),
  openPdf: (id: string, style?: PdfStyle) => openPdf(`/purchases/purchase-orders/${id}/pdf`, style),
};
