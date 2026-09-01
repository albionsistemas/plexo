/** Shape of a Product Variant as returned by Tiendanube's API (GET
 * /products/sku/:sku, PUT /products/:product_id/variants/:id) - confirmed
 * against the official doc, only the fields this integration actually
 * reads/writes (`stock` is null when `stock_management` is false, which
 * this integration never sets). */
export interface TiendanubeProductVariant {
  id: number;
  product_id: number;
  sku: string | null;
  stock: number | null;
}

/** GET /products/sku/:sku returns the first Product whose variants include
 * that SKU - one product can have several variants, only one of which
 * matches the SKU being looked up. */
export interface TiendanubeProductResource {
  id: number;
  variants: TiendanubeProductVariant[];
}

/** This project only ever writes the "es" key - OPLEX has no multi-language
 * concept, Tiendanube's API still requires an object shape for every
 * localized field (`name`, `attributes`, a variant's `values`). */
export interface TiendanubeLocalizedText {
  es: string;
}

/** Body shape for both POST /products/:id/variants (new variant on an
 * existing product) and the variants[] entries of POST /products (Fase 4).
 * `values` must have exactly as many entries as the product's `attributes`,
 * in the same order - omitted entirely for a product with no attributes
 * (Tiendanube's own "virtual variant" case). `stock`/`stock_management` are
 * only ever sent at product-creation time (the initial value) - every
 * update after that omits them on purpose, TiendanubeStockSyncService (Fase
 * 3) owns stock exclusively from then on. */
export interface TiendanubeProductVariantInput {
  sku?: string;
  price: string;
  values?: TiendanubeLocalizedText[];
  stock_management?: boolean;
  stock?: number;
}

/** Body shape for POST /products (Fase 4, first sync of an Article). */
export interface TiendanubeProductCreateInput {
  name: TiendanubeLocalizedText;
  description?: TiendanubeLocalizedText;
  attributes?: TiendanubeLocalizedText[];
  variants: TiendanubeProductVariantInput[];
}

/** Body shape for PUT /products/:id (product-level fields only - never
 * touches variants, Tiendanube doesn't support that on this endpoint, see
 * PLAN_TIENDANUBE.md Fase 4 recon). */
export interface TiendanubeProductUpdateInput {
  name: TiendanubeLocalizedText;
  description?: TiendanubeLocalizedText;
  attributes?: TiendanubeLocalizedText[];
}

/** POST /products/:id/images response - only the field this integration
 * actually reads (needed to delete-then-replace on the next sync, since
 * Tiendanube has no "update this image's src" call). */
export interface TiendanubeImageResource {
  id: number;
}
