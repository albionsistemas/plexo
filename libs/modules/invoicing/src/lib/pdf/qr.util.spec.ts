import { Prisma } from '@plexo/database';
import { buildAfipQrUrl } from './qr.util.js';

function decodePayload(url: string): Record<string, unknown> {
  const base64 = url.replace('https://www.afip.gob.ar/fe/qr/?p=', '');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
}

describe('buildAfipQrUrl', () => {
  it('builds the RG 4892 payload for a Factura A billed to a CUIT, in ARS', () => {
    const url = buildAfipQrUrl({
      issueDate: new Date('2026-08-28T00:00:00Z'),
      issuerCuit: '30-12345678-9',
      pointOfSale: '0001',
      documentLetter: 'A',
      number: '00000005',
      total: new Prisma.Decimal(1210),
      currencyCode: 'ARS',
      exchangeRate: new Prisma.Decimal(1),
      customerTaxId: '20-30405060-7',
      cae: '75123456789012',
    });

    expect(url.startsWith('https://www.afip.gob.ar/fe/qr/?p=')).toBe(true);
    expect(decodePayload(url)).toEqual({
      ver: 1,
      fecha: '2026-08-28',
      cuit: 30123456789,
      ptoVta: 1,
      tipoCmp: 1,
      nroCmp: 5,
      importe: 1210,
      moneda: 'PES',
      ctz: 1,
      tipoDocRec: 80,
      nroDocRec: 20304050607,
      tipoCodAut: 'E',
      codAut: 75123456789012,
    });
  });

  it('uses tipoDocRec 99 and nroDocRec 0 for Consumidor Final (no customerTaxId)', () => {
    const url = buildAfipQrUrl({
      issueDate: new Date('2026-08-28T00:00:00Z'),
      issuerCuit: '30-12345678-9',
      pointOfSale: '0001',
      documentLetter: 'B',
      number: '00000010',
      total: new Prisma.Decimal(500),
      currencyCode: 'ARS',
      exchangeRate: new Prisma.Decimal(1),
      customerTaxId: null,
      cae: '75123456789013',
    });

    const payload = decodePayload(url);
    expect(payload['tipoCmp']).toBe(6); // Factura B
    expect(payload['tipoDocRec']).toBe(99);
    expect(payload['nroDocRec']).toBe(0);
  });

  it('maps USD to AFIP\'s MonId ("DOL") and carries the exchange rate as ctz', () => {
    const url = buildAfipQrUrl({
      issueDate: new Date('2026-08-28T00:00:00Z'),
      issuerCuit: '30-12345678-9',
      pointOfSale: '0002',
      documentLetter: 'C',
      number: '00000001',
      total: new Prisma.Decimal(1050),
      currencyCode: 'USD',
      exchangeRate: new Prisma.Decimal(1050),
      customerTaxId: '20-11111111-1',
      cae: '75123456789014',
    });

    const payload = decodePayload(url);
    expect(payload['tipoCmp']).toBe(11); // Factura C
    expect(payload['moneda']).toBe('DOL');
    expect(payload['ctz']).toBe(1050);
  });
});
