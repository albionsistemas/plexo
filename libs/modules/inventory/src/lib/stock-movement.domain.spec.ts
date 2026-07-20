import { computeStockDelta } from './stock-movement.domain.js';

describe('computeStockDelta', () => {
  it('adds stock for PURCHASE_IN', () => {
    expect(computeStockDelta('PURCHASE_IN', 10)).toBe(10);
  });

  it('adds stock for RETURN', () => {
    expect(computeStockDelta('RETURN', 5)).toBe(5);
  });

  it('adds stock for PRODUCTION_IN', () => {
    expect(computeStockDelta('PRODUCTION_IN', 7)).toBe(7);
  });

  it('subtracts stock for SALE_OUT', () => {
    expect(computeStockDelta('SALE_OUT', 10)).toBe(-10);
  });

  it('subtracts stock for PRODUCTION_OUT', () => {
    expect(computeStockDelta('PRODUCTION_OUT', 3)).toBe(-3);
  });

  it('passes the signed quantity through unchanged for ADJUSTMENT', () => {
    expect(computeStockDelta('ADJUSTMENT', -4)).toBe(-4);
    expect(computeStockDelta('ADJUSTMENT', 4)).toBe(4);
  });
});
