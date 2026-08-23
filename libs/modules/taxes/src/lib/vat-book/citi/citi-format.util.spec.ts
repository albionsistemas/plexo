import { Prisma } from '@plexo/database';
import { formatAmount, formatDate, formatExchangeRate, padAlfa, padNum } from './citi-format.util.js';

describe('padAlfa', () => {
  it('completa con espacios a la derecha hasta el ancho pedido', () => {
    expect(padAlfa('ACME', 10)).toBe('ACME      ');
    expect(padAlfa('ACME', 10)).toHaveLength(10);
  });

  it('trunca si el valor excede el ancho', () => {
    expect(padAlfa('Distribuidora Multi Sociedad Anonima', 10)).toBe('Distribuid');
  });
});

describe('padNum', () => {
  it('completa con ceros a la izquierda hasta el ancho pedido', () => {
    expect(padNum('123', 5)).toBe('00123');
  });

  it('no toca un valor que ya tiene el ancho exacto', () => {
    expect(padNum('00001', 5)).toBe('00001');
  });
});

describe('formatAmount', () => {
  it('multiplica por 100, redondea y completa a 15 dígitos sin punto decimal', () => {
    expect(formatAmount(1210)).toBe('000000000121000');
    expect(formatAmount(1210)).toHaveLength(15);
  });

  it('funciona con centavos y con Prisma.Decimal', () => {
    expect(formatAmount(new Prisma.Decimal('105.5'))).toBe('000000000010550');
  });

  it('nunca lleva signo (los importes de este archivo son siempre naturales/positivos)', () => {
    expect(formatAmount(-500)).toBe('000000000050000');
  });

  it('acepta un ancho custom (usado en los campos de 4/10 dígitos)', () => {
    expect(formatAmount(0, 4)).toBe('0000');
  });
});

describe('formatExchangeRate', () => {
  it('4 enteros + 6 decimales, 10 caracteres, sin punto decimal', () => {
    expect(formatExchangeRate(1)).toBe('0001000000');
    expect(formatExchangeRate(1)).toHaveLength(10);
  });

  it('redondea un tipo de cambio con decimales', () => {
    expect(formatExchangeRate(1350.123456)).toBe('1350123456');
  });
});

describe('formatDate', () => {
  it('formatea AAAAMMDD en UTC', () => {
    expect(formatDate(new Date('2026-08-23T00:00:00Z'))).toBe('20260823');
  });

  it('devuelve 8 espacios cuando no hay fecha', () => {
    expect(formatDate(null)).toBe('        ');
    expect(formatDate(undefined)).toHaveLength(8);
  });
});
