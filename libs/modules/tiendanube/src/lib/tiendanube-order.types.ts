/**
 * Partial shape of Tiendanube's Order resource (`GET /orders/:id`) -
 * only the fields TiendanubeWebhookService actually reads, verified
 * against the official doc, not guessed. `contact_*` fields (not the
 * nested `customer` object) are used as the canonical buyer/contact
 * source: they're always present regardless of app scopes, while
 * `customer` requires the `read_customers` scope this integration doesn't
 * request.
 */
export interface TiendanubeOrderLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  /** null/empty when the product was never given a SKU in the store's own
   * catalog - always "unmapped" in OPLEX regardless of matching logic. */
  sku: string | null;
  name: string;
  /** Tiendanube returns money amounts as decimal strings, e.g. "40.00". */
  price: string;
  quantity: number;
}

export interface TiendanubeOrderResource {
  id: number;
  number: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** CPF/CNPJ/DNI/CUIT depending on locale - null/empty for a final
   * consumer checkout that didn't collect one, which this integration must
   * handle without failing (see TiendanubeWebhookService.resolveCustomer). */
  contact_identification: string | null;
  currency: string;
  total: string;
  products: TiendanubeOrderLineItem[];
}
