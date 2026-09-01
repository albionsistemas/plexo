export const STOCK_UPDATED = 'stock.updated';
export const CATALOG_CHANGED = 'article.catalog-changed';
export const INVOICE_CREATED = 'invoice.created';
export const INVOICE_PAID = 'invoice.paid';
export const TIENDANUBE_CATALOG_SYNC_PROGRESS = 'tiendanube.catalog-sync-progress';
export const TIENDANUBE_ORDER_RECEIVED = 'tiendanube.order-received';

export interface StockUpdatedEvent {
  tenantId: string;
  warehouseId: string;
  articleVariantId: string;
  newQuantity: string;
}

/** Raised on every Article/ArticleVariant create/update (name, price, sku,
 * attributes, image) - consumed by TiendanubeCatalogSyncService (Fase 4 de
 * PLAN_TIENDANUBE.md). Article-level, not variant-level: Tiendanube's
 * "product" bundles every variant of one Article together, so a change to
 * any one variant re-syncs the whole product. */
export interface CatalogChangedEvent {
  tenantId: string;
  articleId: string;
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

/** Raised by TiendanubeCatalogSyncService.syncAllPublished after each
 * article it processes (synced or skipped) - drives the "sincronizando
 * X/Y" progress bar (Fase 5 de PLAN_TIENDANUBE.md). `done` includes both
 * outcomes, not just successes, so it always reaches `total`. */
export interface TiendanubeCatalogSyncProgressEvent {
  tenantId: string;
  done: number;
  total: number;
}

/** Raised once a Tiendanube order webhook finishes persisting its
 * TiendanubeOrder row (order/paid) - drives the live "nueva orden" refresh
 * on the orders-in-review page (Fase 5), same live-update pattern as
 * INVOICE_CREATED/INVOICE_PAID. */
export interface TiendanubeOrderReceivedEvent {
  tenantId: string;
  tiendanubeOrderRowId: string;
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
