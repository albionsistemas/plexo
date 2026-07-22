import { isValidCuit, normalizeCuit } from './cuit.js';

describe('normalizeCuit', () => {
  it('strips dashes and spaces', () => {
    expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
    expect(normalizeCuit('20 12345678 6')).toBe('20123456786');
  });
});

describe('isValidCuit', () => {
  it('accepts a CUIT with a correct check digit, dashes or not', () => {
    expect(isValidCuit('20123456786')).toBe(true);
    expect(isValidCuit('20-12345678-6')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidCuit('20123456780')).toBe(false);
  });

  it('rejects the wrong length', () => {
    expect(isValidCuit('123')).toBe(false);
    expect(isValidCuit('201234567860')).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(isValidCuit('not-a-cuit')).toBe(false);
  });
});
