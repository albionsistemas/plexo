export const STOCK_UPDATED = 'stock.updated';
export const INVOICE_CREATED = 'invoice.created';
export const INVOICE_PAID = 'invoice.paid';

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

/** Raised by MercadoPagoWebhookController once a webhook-driven payment is
 * fully reconciled (Receipt created + journal entry posted) - the only
 * producer today, unlike a manual "cobrar" from the UI, which nobody else
 * needs to be told about live since the person doing it already sees the
 * result in their own screen. */
export interface InvoicePaidEvent {
  tenantId: string;
  invoiceId: string;
  amount: string;
  balanceDue: string;
  status: string;
}

// Presence isn't driven through EventEmitter2 like the two above - the
// gateway raises these directly from handleConnection/handleDisconnect,
// which already have everything they need (no other module produces
// presence changes).
export const PRESENCE_ONLINE = 'presence.online';
export const PRESENCE_OFFLINE = 'presence.offline';
export const PRESENCE_SNAPSHOT = 'presence.snapshot';

export interface PresenceUser {
  userId: string;
  name: string | null;
  email: string;
}

export interface PresenceChangeEvent {
  userId: string;
}

export interface PresenceSnapshotEvent {
  online: PresenceUser[];
}
