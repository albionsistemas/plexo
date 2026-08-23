import { Prisma, tenantContextStorage } from '@plexo/database';
import { VatBookService } from './vat-book.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function d(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

describe('VatBookService.getSalesBook', () => {
  it('discrimina el IVA de una factura por alícuota (21%/10.5%/27%) usando lineTotal-netAmount, no recalculando', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            issueDate: new Date('2026-08-05'),
            documentLetter: 'A',
            pointOfSale: '0001',
            number: '00000123',
            customerName: 'Acme SA',
            customerTaxId: '30-71659554-9',
            customer: { taxCondition: 'Responsable Inscripto' },
            currency: { code: 'ARS' },
            total: d(1210 + 605 + 254),
            lines: [
              // 21%: neto 1000, IVA 210 (lineTotal 1210)
              { taxKind: 'GRAVADO', taxRate: d(21), netAmount: d(1000), lineTotal: d(1210) },
              // 10.5%: neto 500, IVA 52.5 (lineTotal 552.5)
              { taxKind: 'GRAVADO', taxRate: d(10.5), netAmount: d(500), lineTotal: d(552.5) },
              // 27%: neto 200, IVA 54 (lineTotal 254)
              { taxKind: 'GRAVADO', taxRate: d(27), netAmount: d(200), lineTotal: d(254) },
              // Exento
              { taxKind: 'EXENTO', taxRate: d(0), netAmount: d(300), lineTotal: d(300) },
              // No gravado
              { taxKind: 'NO_GRAVADO', taxRate: d(0), netAmount: d(150), lineTotal: d(150) },
            ],
          },
        ]),
      },
      creditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new VatBookService();

    const result = await runInTenant(db, () => service.getSalesBook());

    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.netTaxed).toBe(1700);
    expect(entry.netExempt).toBe(300);
    expect(entry.netUntaxed).toBe(150);
    expect(entry.vat21).toBeCloseTo(210);
    expect(entry.vat10_5).toBeCloseTo(52.5);
    expect(entry.vat27).toBeCloseTo(54);
    expect(entry.vatOther).toBe(0);
    expect(entry.vatTotal).toBeCloseTo(316.5);
    expect(entry.isCreditNote).toBe(false);
    expect(entry.documentType).toBe('Factura A');
    expect(entry.counterpartyDocType).toBe('CUIT');
  });

  it('resta una Nota de Crédito de los totales acumulados (importes negativos)', async () => {
    const db = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'inv-1',
            issueDate: new Date('2026-08-05'),
            documentLetter: 'B',
            pointOfSale: '0001',
            number: '00000200',
            customerName: 'Consumidor Final',
            customerTaxId: null,
            customer: { taxCondition: null },
            currency: { code: 'ARS' },
            total: d(1210),
            lines: [{ taxKind: 'GRAVADO', taxRate: d(21), netAmount: d(1000), lineTotal: d(1210) }],
          },
        ]),
      },
      creditNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cn-1',
            issueDate: new Date('2026-08-06'),
            documentLetter: 'B',
            pointOfSale: '0001',
            number: '00000050',
            total: d(1210),
            currency: { code: 'ARS' },
            invoice: { customerName: 'Consumidor Final', customerTaxId: null, customer: { taxCondition: null } },
            lines: [
              {
                netAmount: d(1000),
                taxAmount: d(210),
                invoiceLine: { taxKind: 'GRAVADO', taxRate: d(21) },
              },
            ],
          },
        ]),
      },
    };
    const service = new VatBookService();

    const result = await runInTenant(db, () => service.getSalesBook());

    expect(result.entries).toHaveLength(2);
    const creditNoteEntry = result.entries.find((e) => e.isCreditNote);
    expect(creditNoteEntry).toMatchObject({
      netTaxed: -1000,
      vat21: -210,
      vatTotal: -210,
      total: -1210,
      counterpartyDocType: 'CF',
    });
    // El total acumulado neta la factura ($1000 neto/$210 IVA) contra la
    // NC completa -> todo en cero, no $2000/$420 de sumar los absolutos.
    expect(result.totals.netTaxed).toBe(0);
    expect(result.totals.vat21).toBe(0);
    expect(result.totals.vatTotal).toBe(0);
    expect(result.totals.total).toBe(0);
  });
});

describe('VatBookService.getPurchasesBook', () => {
  it('no discrimina por alícuota (el schema de compras no la guarda por línea) - todo el IVA cae en vatOther, separado de Percepciones', async () => {
    const db = {
      purchaseInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pi-1',
            supplierInvoiceDate: new Date('2026-08-10'),
            supplierInvoiceNumber: '0001-00045678',
            supplierName: 'Distribuidora Multi SA',
            supplierTaxId: '30-12345678-9',
            supplier: { taxCondition: 'Responsable Inscripto' },
            currency: { code: 'ARS' },
            subtotal: d(1000),
            total: d(1210 + 30),
            taxLines: [
              { type: 'IVA_CREDITO', concept: 'IVA 21%', amount: d(210) },
              { type: 'PERCEPCION', concept: 'Percepción IIBB CABA', amount: d(30) },
            ],
          },
        ]),
      },
      purchaseCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new VatBookService();

    const result = await runInTenant(db, () => service.getPurchasesBook());

    const entry = result.entries[0];
    expect(entry.vat21).toBe(0);
    expect(entry.vat10_5).toBe(0);
    expect(entry.vat27).toBe(0);
    expect(entry.vatOther).toBe(210);
    expect(entry.vatTotal).toBe(210);
    expect(entry.perceptions).toBe(30);
    expect(entry.documentType).toBe('Factura de compra');
    expect(entry.documentLetter).toBeNull();
    expect(entry.pointOfSale).toBeNull();
  });

  it('resta una Nota de Crédito de compra de los totales, incluyendo Percepciones', async () => {
    const db = {
      purchaseInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      purchaseCreditNote: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pcn-1',
            supplierCreditNoteDate: new Date('2026-08-11'),
            supplierCreditNoteNumber: '0001-00000012',
            supplierName: 'Distribuidora Multi SA',
            supplierTaxId: '30-12345678-9',
            supplier: { taxCondition: 'Responsable Inscripto' },
            currency: { code: 'ARS' },
            subtotal: d(500),
            total: d(605 + 15),
            taxLines: [
              { type: 'IVA_CREDITO', concept: 'IVA 21%', amount: d(105) },
              { type: 'PERCEPCION', concept: 'Percepción IIBB', amount: d(15) },
            ],
          },
        ]),
      },
    };
    const service = new VatBookService();

    const result = await runInTenant(db, () => service.getPurchasesBook());

    expect(result.entries[0]).toMatchObject({
      isCreditNote: true,
      netTaxed: -500,
      vatOther: -105,
      perceptions: -15,
      total: -620,
    });
    expect(result.totals.total).toBe(-620);
  });
});
