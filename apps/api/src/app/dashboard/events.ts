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
