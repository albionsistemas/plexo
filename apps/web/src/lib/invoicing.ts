import { api } from '@/lib/api';

export interface Currency {
  id: string;
  code: string;
  name: string;
  isBase: boolean;
}

export interface InvoiceLine {
  id: string;
  articleVariantId: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

export interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  customerTaxId: string | null;
  documentLetter: string;
  pointOfSale: string;
  number: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  balanceDue: string;
  afipCae: string | null;
  lines: InvoiceLine[];
}

export interface CreateSaleLineInput {
  articleVariantId: string;
  quantity: number;
  discountType?: 'PERCENTAGE' | 'AMOUNT';
  discountValue?: number;
}

export interface CreateSaleInput {
  customerId: string;
  warehouseId: string;
  documentLetter: 'A' | 'B' | 'C' | 'M';
  branchId: string;
  currencyId: string;
  globalDiscountPercent?: number;
  dueDate?: string;
  lines: CreateSaleLineInput[];
}

export interface RecordReceiptInput {
  invoiceId: string;
  amount: number;
  method: string;
  financialAccountId?: string;
}

export interface CreateCreditNoteInput {
  invoiceId: string;
  reason: string;
}

export const invoicingApi = {
  listInvoices: () => api.get<Invoice[]>('/invoicing/invoices').then((r) => r.data),
  listCurrencies: () => api.get<Currency[]>('/invoicing/currencies').then((r) => r.data),
  createSale: (dto: CreateSaleInput) => api.post<Invoice>('/sales/invoices', dto).then((r) => r.data),
  recordReceipt: (dto: RecordReceiptInput) =>
    api.post('/invoicing/receipts', dto).then((r) => r.data),
  createCreditNote: (dto: CreateCreditNoteInput) =>
    api.post('/sales/credit-notes', dto).then((r) => r.data),
};
