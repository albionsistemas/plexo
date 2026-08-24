import { Prisma, tenantContextStorage } from '@plexo/database';
import { CitiExportService } from './citi-export.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function d(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

// Slice helper usando las posiciones 1-indexadas "Desde/Hasta" tal cual
// las documenta el diseño de registro de ARCA, para no tener que
// reconstruir la línea entera a mano en cada test.
function field(line: string, from: number, to: number): string {
  return line.slice(from - 1, to);
}

describe('CitiExportService.getVentasCbte', () => {
  it('arma la línea de una Factura A con 2 alícuotas mixtas en las posiciones documentadas (266 chars)', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            issueDate: new Date('2026-08-01T00:00:00Z'),
            dueDate: null,
            documentLetter: 'A',
            pointOfSale: '0001',
            number: '00000001',
            customerTaxId: '20111111112',
            customerName: 'Cliente SA',
            total: d(1762.5),
            exchangeRate: d(1),
            currency: { code: 'ARS' },
            lines: [
              { netAmount: d(1000), taxRate: d(21), taxKind: 'GRAVADO', lineTotal: d(1210) },
              { netAmount: d(500), taxRate: d(10.5), taxKind: 'GRAVADO', lineTotal: d(552.5) },
            ],
          },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content, skippedCount } = await runInTenant(db, () => service.getVentasCbte());
    const line = content.split('\r\n')[0];

    expect(line).toHaveLength(266);
    expect(skippedCount).toBe(0);
    expect(field(line, 1, 8)).toBe('20260801');
    expect(field(line, 9, 11)).toBe('001'); // Factura A
    expect(field(line, 12, 16)).toBe('00001');
    expect(field(line, 17, 36)).toBe('0'.repeat(12) + '00000001');
    expect(field(line, 57, 58)).toBe('80'); // CUIT
    expect(field(line, 59, 78)).toBe('0'.repeat(9) + '20111111112');
    expect(field(line, 79, 108)).toBe('Cliente SA'.padEnd(30, ' '));
    expect(field(line, 109, 123)).toBe('000000000176250'); // total 1762.50
    expect(field(line, 229, 231)).toBe('PES');
    expect(field(line, 232, 241)).toBe('0001000000'); // tipo de cambio 1
    expect(field(line, 242, 242)).toBe('2'); // 2 alícuotas distintas
    expect(field(line, 243, 243)).toBe(' '); // operación normal (mixta gravada, no exenta)
    expect(field(line, 259, 266)).toBe(' '.repeat(8)); // sin fecha de vencimiento
  });

  it('marca Código de Operación E cuando el comprobante es enteramente exento', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-2',
            issueDate: new Date('2026-08-01T00:00:00Z'),
            dueDate: null,
            documentLetter: 'B',
            pointOfSale: '0001',
            number: '00000002',
            customerTaxId: null,
            customerName: 'Consumidor Final',
            total: d(200),
            exchangeRate: d(1),
            currency: { code: 'ARS' },
            lines: [{ netAmount: d(200), taxRate: d(0), taxKind: 'EXENTO', lineTotal: d(200) }],
          },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content } = await runInTenant(db, () => service.getVentasCbte());
    const line = content.split('\r\n')[0];

    expect(field(line, 9, 11)).toBe('006'); // Factura B
    expect(field(line, 57, 58)).toBe('99'); // Consumidor Final
    expect(field(line, 154, 168)).toBe('000000000020000'); // operaciones exentas = 200
    expect(field(line, 242, 242)).toBe('0'); // sin alícuotas gravadas
    expect(field(line, 243, 243)).toBe('E');
  });

  it('una Nota de Crédito usa el código de comprobante NC, no el de Factura, con importe natural (no negativo)', async () => {
    const db = {
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cn-1',
            issueDate: new Date('2026-08-05T00:00:00Z'),
            documentLetter: 'B',
            pointOfSale: '0001',
            number: '00000001',
            total: d(121),
            exchangeRate: d(1),
            currency: { code: 'ARS' },
            invoice: { customerName: 'Cliente SA', customerTaxId: '20111111112' },
            lines: [
              {
                netAmount: d(100),
                taxAmount: d(21),
                invoiceLine: { taxKind: 'GRAVADO', taxRate: d(21) },
              },
            ],
          },
        ]),
      },
    };
    const service = new CitiExportService();

    const { content } = await runInTenant(db, () => service.getVentasCbte());
    const line = content.split('\r\n')[0];

    expect(field(line, 9, 11)).toBe('008'); // Nota de Crédito B
    expect(field(line, 109, 123)).toBe('000000000012100'); // 121.00, positivo
  });
});

describe('CitiExportService.getVentasAlicuotas', () => {
  it('genera una fila por cada alícuota gravada, con el código de tabla correcto (62 chars)', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            documentLetter: 'A',
            pointOfSale: '0001',
            number: '00000001',
            lines: [
              { netAmount: d(1000), taxRate: d(21), taxKind: 'GRAVADO', lineTotal: d(1210) },
              { netAmount: d(500), taxRate: d(10.5), taxKind: 'GRAVADO', lineTotal: d(552.5) },
              { netAmount: d(50), taxRate: d(0), taxKind: 'EXENTO', lineTotal: d(50) },
            ],
          },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content } = await runInTenant(db, () => service.getVentasAlicuotas());
    const lines = content.split('\r\n');

    expect(lines).toHaveLength(2); // la línea EXENTO no genera fila de alícuota
    for (const line of lines) expect(line).toHaveLength(62);
    const line21 = lines.find((l) => field(l, 44, 47) === '0005');
    expect(line21).toBeDefined();
    expect(field(line21 as string, 29, 43)).toBe('000000000100000'); // neto 1000.00
    expect(field(line21 as string, 48, 62)).toBe('000000000021000'); // IVA 210.00
    const line10_5 = lines.find((l) => field(l, 44, 47) === '0004');
    expect(line10_5).toBeDefined();
  });
});

describe('CitiExportService.getComprasCbte', () => {
  function makePurchaseInvoice(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pinv-1',
      supplierInvoiceDate: new Date('2026-08-10T00:00:00Z'),
      documentLetter: 'A',
      pointOfSale: '0001',
      number: '00000045',
      supplierTaxId: '30123456789',
      supplierName: 'Distribuidora Multi SA',
      total: d(1573),
      currency: { code: 'ARS' },
      taxLines: [
        { type: 'IVA_CREDITO', amount: d(210), netAmount: d(1000), taxRate: d(21), taxType: null },
        { type: 'PERCEPCION', amount: d(30), netAmount: null, taxRate: null, taxType: 'GROSS_INCOME' },
        { type: 'PERCEPCION', amount: d(15), netAmount: null, taxRate: null, taxType: 'VAT' },
      ],
      ...overrides,
    };
  }

  it('rutea cada Percepción a su columna (IVA/IIBB) según taxType (325 chars)', async () => {
    const db = {
      purchaseInvoice: { findMany: jest.fn().mockResolvedValue([makePurchaseInvoice()]) },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content, skippedCount } = await runInTenant(db, () => service.getComprasCbte());
    const line = content.split('\r\n')[0];

    expect(line).toHaveLength(325);
    expect(skippedCount).toBe(0);
    expect(field(line, 9, 11)).toBe('001'); // Factura A
    expect(field(line, 150, 164)).toBe('000000000001500'); // percepción IVA = 15.00
    expect(field(line, 180, 194)).toBe('000000000003000'); // percepción IIBB = 30.00
    expect(field(line, 240, 254)).toBe('000000000021000'); // crédito fiscal computable = 210.00
  });

  it('excluye (y cuenta) una factura de compra sin documentLetter/pointOfSale/number cargados', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([makePurchaseInvoice({ documentLetter: null, pointOfSale: null })]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content, skippedCount } = await runInTenant(db, () => service.getComprasCbte());

    expect(content).toBe('');
    expect(skippedCount).toBe(1);
  });

  it('una Percepción sin taxType cae en "otros impuestos nacionales", no se pierde', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          makePurchaseInvoice({
            taxLines: [{ type: 'PERCEPCION', amount: d(50), netAmount: null, taxRate: null, taxType: null }],
          }),
        ]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content } = await runInTenant(db, () => service.getComprasCbte());
    const line = content.split('\r\n')[0];

    expect(field(line, 165, 179)).toBe('000000000005000'); // otros impuestos nacionales = 50.00
    expect(field(line, 150, 164)).toBe('0'.repeat(15)); // percepción IVA en 0
  });

  it('excluye (y cuenta) una factura de compra en moneda distinta de ARS - no inventa una cotización 1:1', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([makePurchaseInvoice({ currency: { code: 'USD' } })]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content, skippedCount } = await runInTenant(db, () => service.getComprasCbte());

    expect(content).toBe('');
    expect(skippedCount).toBe(1);
  });

  it('excluye (y cuenta) una factura con una línea IVA_CREDITO sin taxRate/netAmount, para no reportar un crédito fiscal que Alícuotas no puede desglosar', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          makePurchaseInvoice({
            taxLines: [{ type: 'IVA_CREDITO', amount: d(210), netAmount: null, taxRate: null, taxType: null }],
          }),
        ]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content, skippedCount } = await runInTenant(db, () => service.getComprasCbte());

    expect(content).toBe('');
    expect(skippedCount).toBe(1);
  });
});

describe('CitiExportService.getComprasAlicuotas', () => {
  it('genera una fila por alícuota de Crédito Fiscal, 84 chars', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pinv-1',
            documentLetter: 'A',
            pointOfSale: '0001',
            number: '00000045',
            supplierTaxId: '30123456789',
            taxLines: [
              { type: 'IVA_CREDITO', amount: d(210), netAmount: d(1000), taxRate: d(21) },
              { type: 'PERCEPCION', amount: d(30), netAmount: null, taxRate: null },
            ],
          },
        ]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content } = await runInTenant(db, () => service.getComprasAlicuotas());
    const lines = content.split('\r\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(84);
    expect(field(lines[0], 66, 69)).toBe('0005'); // 21%
    expect(field(lines[0], 51, 65)).toBe('000000000100000');
    expect(field(lines[0], 70, 84)).toBe('000000000021000');
  });

  it('excluye (y cuenta) una factura con una línea IVA_CREDITO sin taxRate/netAmount, en vez de una fila que no cerraría contra el crédito fiscal de getComprasCbte', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pinv-1',
            documentLetter: 'A',
            pointOfSale: '0001',
            number: '00000045',
            supplierTaxId: '30123456789',
            taxLines: [{ type: 'IVA_CREDITO', amount: d(210), netAmount: null, taxRate: null }],
          },
        ]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CitiExportService();

    const { content, skippedCount } = await runInTenant(db, () => service.getComprasAlicuotas());

    expect(content).toBe('');
    expect(skippedCount).toBe(1);
  });
});
