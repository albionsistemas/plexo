import { api } from '@/lib/api';

export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type QuoteSendChannel = 'EMAIL' | 'WHATSAPP';
// Duplicated from purchases.ts on purpose - no module/domain file imports
// another domain's internals in this codebase (see the equivalent backend
// rule on purchase-email-sender.port.ts), it's the same convention applied
// to the frontend's lib/*.ts files.
export type PdfStyle = 'MODERNO' | 'COMPACTO' | 'TRADICIONAL' | 'NATURAL' | 'LETRAS_GRANDES';

export const PDF_STYLES: { value: PdfStyle; label: string; description: string }[] = [
  { value: 'MODERNO', label: 'Moderno', description: 'Colores, encabezado destacado, look actual' },
  { value: 'COMPACTO', label: 'Compacto', description: 'Denso, ahorra espacio en cotizaciones largas' },
  { value: 'TRADICIONAL', label: 'Tradicional', description: 'Blanco y negro, formal, con firmas' },
  { value: 'NATURAL', label: 'Natural', description: 'Tonos cálidos, look amigable' },
  { value: 'LETRAS_GRANDES', label: 'Letras grandes', description: 'Máxima legibilidad, tipografía grande' },
];

export interface QuoteLineInput {
  articleVariantId: string;
  quantity: number;
  unitPrice: number;
  notes?: string;
}

export interface QuoteLineDetail {
  id: string;
  articleVariantId: string;
  quantity: string;
  unitPrice: string;
  notes: string | null;
  articleVariant: { sku: string; article: { name: string; imageUrl: string | null } };
}

export interface CustomerRef {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  fiscalAddress: string | null;
}

export interface QuoteSummary {
  id: string;
  number: string;
  status: QuoteStatus;
  total: string;
  validUntil: string | null;
  createdAt: string;
  customer: { id: string; name: string; email: string | null };
  currency: { code: string };
}

export interface QuoteDetail {
  id: string;
  number: string;
  status: QuoteStatus;
  total: string;
  notes: string | null;
  validUntil: string | null;
  sentAt: string | null;
  sentVia: QuoteSendChannel | null;
  createdAt: string;
  customer: CustomerRef;
  currency: { id: string; code: string; name: string };
  lines: QuoteLineDetail[];
  createdBy: { id: string; name: string | null; email: string };
}

export interface CreateQuoteInput {
  customerId: string;
  currencyId: string;
  validUntil?: string;
  notes?: string;
  lines: QuoteLineInput[];
}

export type UpdateQuoteInput = Partial<CreateQuoteInput>;

const STATUS_COLOR_CLASSES: Record<QuoteStatus, string> = {
  DRAFT: 'bg-slate-300 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  SENT: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300',
  ACCEPTED: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
  REJECTED: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
  CANCELLED: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};

const STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

/** EXPIRED isn't a stored status (see schema.prisma's QuoteStatus enum
 * comment) - it's derived here from validUntil, same "computed client-side"
 * convention as describeQuoteRequestStatus in purchases.ts. Only a SENT
 * quote can be "expired"; a still-DRAFT one just hasn't gone out yet. */
export function describeQuoteStatus(quote: {
  status: QuoteStatus;
  validUntil: string | null;
}): { label: string; colorClass: string } {
  if (quote.status === 'SENT' && quote.validUntil && new Date(quote.validUntil) < new Date()) {
    return { label: 'Vencida', colorClass: 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300' };
  }
  return { label: STATUS_LABELS[quote.status], colorClass: STATUS_COLOR_CLASSES[quote.status] };
}

async function openPdf(id: string, style?: PdfStyle): Promise<void> {
  const res = await api.get(`/quotes/${id}/pdf`, {
    params: style ? { style } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export interface QuotePreferences {
  quotePrefix: string;
  quoteNextNumber: number;
  quotePdfStyle: PdfStyle;
}

export const quotePreferencesApi = {
  get: () => api.get<QuotePreferences>('/quotes/preferences').then((r) => r.data),
  update: (dto: { quotePrefix?: string; quotePdfStyle?: PdfStyle }) =>
    api.patch<QuotePreferences>('/quotes/preferences', dto).then((r) => r.data),
};

export const quotesApi = {
  list: (status?: QuoteStatus, customerId?: string) =>
    api.get<QuoteSummary[]>('/quotes', { params: { status, customerId } }).then((r) => r.data),
  get: (id: string) => api.get<QuoteDetail>(`/quotes/${id}`).then((r) => r.data),
  create: (dto: CreateQuoteInput) => api.post<QuoteDetail>('/quotes', dto).then((r) => r.data),
  update: (id: string, dto: UpdateQuoteInput) =>
    api.patch<QuoteDetail>(`/quotes/${id}`, dto).then((r) => r.data),
  cancel: (id: string) => api.patch<QuoteDetail>(`/quotes/${id}/cancel`).then((r) => r.data),
  accept: (id: string) => api.patch<QuoteDetail>(`/quotes/${id}/accept`).then((r) => r.data),
  reject: (id: string) => api.patch<QuoteDetail>(`/quotes/${id}/reject`).then((r) => r.data),
  sendEmail: (id: string) => api.post<QuoteDetail>(`/quotes/${id}/send-email`).then((r) => r.data),
  whatsappLink: (id: string, phone: string) =>
    api.get<{ url: string }>(`/quotes/${id}/whatsapp-link`, { params: { phone } }).then((r) => r.data),
  markSentWhatsapp: (id: string) =>
    api.post<QuoteDetail>(`/quotes/${id}/mark-sent-whatsapp`).then((r) => r.data),
  openPdf: (id: string, style?: PdfStyle) => openPdf(id, style),
};
