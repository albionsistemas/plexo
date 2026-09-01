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
