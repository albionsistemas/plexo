import type { MovementType } from '@plexo/database';

/**
 * Signed change to apply to a StockLedger.quantity for one movement.
 * `quantity` is always the positive magnitude the caller reports, except
 * for ADJUSTMENT where it's already the signed correction — direction for
 * every other type is implied entirely by `type`, never by the sign the
 * caller happened to send.
 */
export function computeStockDelta(type: MovementType, quantity: number): number {
  switch (type) {
    case 'SALE_OUT':
    case 'PRODUCTION_OUT':
      return -quantity;
    case 'PURCHASE_IN':
    case 'RETURN':
    case 'PRODUCTION_IN':
    case 'ADJUSTMENT':
      return quantity;
  }
}
