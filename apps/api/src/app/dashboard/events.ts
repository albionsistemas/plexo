export const STOCK_UPDATED = 'stock.updated';
export const INVOICE_CREATED = 'invoice.created';

export interface StockUpdatedEvent {
  tenantId: string;
  warehouseId: string;
  articleVariantId: string;
  newQuantity: string;
}

export interface InvoiceCreatedEvent {
  tenantId: string;
  invoiceId: string;
  total: string;
  customerName: string;
  status: string;
  issueDate: string;
}
