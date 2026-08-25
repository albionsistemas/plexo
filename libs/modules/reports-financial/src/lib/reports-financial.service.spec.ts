import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { ReportsFinancialService } from './reports-financial.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('ReportsFinancialService.recordFinancialTransaction', () => {
  const dto = { financialAccountId: 'acc-1', amount: 100 };

  it('rejects a zero-amount transaction', async () => {
    const service = new ReportsFinancialService();
    await expect(
      runInTenant({}, () => service.recordFinancialTransaction({ ...dto, amount: 0 })),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the financial account does not exist', async () => {
    const db = { financialAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReportsFinancialService();

    await expect(runInTenant(db, () => service.recordFinancialTransaction(dto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates the transaction and increments the account balance by the same amount', async () => {
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
    };
    const service = new ReportsFinancialService();

    await runInTenant(db, () => service.recordFinancialTransaction(dto));

    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { currentBalance: { increment: 100 } },
    });
  });

  it('supports a negative amount for an outflow', async () => {
    const db = {
      financialAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-1' }) },
    };
    const service = new ReportsFinancialService();

    await runInTenant(db, () => service.recordFinancialTransaction({ ...dto, amount: -40 }));

    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { currentBalance: { increment: -40 } },
    });
  });
});

describe('ReportsFinancialService.transferBetweenAccounts', () => {
  const dto = { fromFinancialAccountId: 'acc-1', toFinancialAccountId: 'acc-2', amount: 100 };

  it('rejects transferring an account to itself', async () => {
    const service = new ReportsFinancialService();
    await expect(
      runInTenant({}, () => service.transferBetweenAccounts({ ...dto, toFinancialAccountId: 'acc-1' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws when the origin account does not exist', async () => {
    const db = {
      financialAccount: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          where.id === 'acc-1' ? null : { id: 'acc-2', name: 'Banco' },
        ),
      },
    };
    const service = new ReportsFinancialService();

    await expect(runInTenant(db, () => service.transferBetweenAccounts(dto))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('debits the origin and credits the destination by the same amount, each keeping its own balance in sync', async () => {
    const accountsById: Record<string, { id: string; name: string }> = {
      'acc-1': { id: 'acc-1', name: 'Caja Efectivo' },
      'acc-2': { id: 'acc-2', name: 'Banco Galicia' },
    };
    const db = {
      financialAccount: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) => accountsById[where.id]),
        update: jest.fn().mockResolvedValue({}),
      },
      financialTransaction: {
        create: jest.fn(({ data }: { data: { financialAccountId: string } }) => ({
          id: `tx-${data.financialAccountId}`,
          ...data,
        })),
      },
    };
    const service = new ReportsFinancialService();

    const result = await runInTenant(db, () => service.transferBetweenAccounts(dto));

    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-1' },
      data: { currentBalance: { increment: -100 } },
    });
    expect(db.financialAccount.update).toHaveBeenCalledWith({
      where: { id: 'acc-2' },
      data: { currentBalance: { increment: 100 } },
    });
    expect(result.from.financialAccountId).toBe('acc-1');
    expect(result.to.financialAccountId).toBe('acc-2');
  });
});

describe('ReportsFinancialService.listTransactions', () => {
  it('throws when the account does not exist', async () => {
    const db = { financialAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReportsFinancialService();

    await expect(runInTenant(db, () => service.listTransactions('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns every transaction for the account, reconciled or not, oldest first', async () => {
    const transactions = [
      { id: 'tx-1', financialAccountId: 'acc-1', amount: new Prisma.Decimal(100), reconciled: true },
      { id: 'tx-2', financialAccountId: 'acc-1', amount: new Prisma.Decimal(-40), reconciled: false },
    ];
    const findMany = jest.fn().mockResolvedValue(transactions);
    const db = {
      financialAccount: { findUnique: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
      financialTransaction: { findMany },
    };
    const service = new ReportsFinancialService();

    const result = await runInTenant(db, () => service.listTransactions('acc-1'));

    expect(findMany).toHaveBeenCalledWith({
      where: { financialAccountId: 'acc-1' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(result).toBe(transactions);
  });
});

describe('ReportsFinancialService.reconcileTransaction', () => {
  it('throws when the transaction does not exist', async () => {
    const db = { financialTransaction: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReportsFinancialService();

    await expect(runInTenant(db, () => service.reconcileTransaction('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects reconciling a transaction that is already reconciled', async () => {
    const db = {
      financialTransaction: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tx-1', reconciled: true }),
      },
    };
    const service = new ReportsFinancialService();

    await expect(runInTenant(db, () => service.reconcileTransaction('tx-1'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('marks an unreconciled transaction as reconciled', async () => {
    const db = {
      financialTransaction: {
        findUnique: jest.fn().mockResolvedValue({ id: 'tx-1', reconciled: false }),
        update: jest.fn().mockResolvedValue({ id: 'tx-1', reconciled: true }),
      },
    };
    const service = new ReportsFinancialService();

    await runInTenant(db, () => service.reconcileTransaction('tx-1'));

    expect(db.financialTransaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      data: { reconciled: true },
    });
  });
});

describe('ReportsFinancialService.getCashflowProjection', () => {
  function makeDb(
    overrides: {
      accounts?: unknown[];
      invoices?: unknown[];
      purchaseInvoices?: unknown[];
      checks?: unknown[];
    } = {},
  ) {
    return {
      financialAccount: { findMany: jest.fn().mockResolvedValue(overrides.accounts ?? []) },
      invoice: { findMany: jest.fn().mockResolvedValue(overrides.invoices ?? []) },
      purchaseInvoice: { findMany: jest.fn().mockResolvedValue(overrides.purchaseInvoices ?? []) },
      check: { findMany: jest.fn().mockResolvedValue(overrides.checks ?? []) },
    };
  }

  it('rejects toDate before fromDate', async () => {
    const service = new ReportsFinancialService();
    await expect(
      runInTenant(makeDb(), () =>
        service.getCashflowProjection({ fromDate: '2026-09-10', toDate: '2026-09-01' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('opening balance is the sum of every financial account balance, and nothing due leaves it unchanged', async () => {
    const service = new ReportsFinancialService();
    const db = makeDb({
      accounts: [{ currentBalance: new Prisma.Decimal(1000) }, { currentBalance: new Prisma.Decimal(-200) }],
    });

    const result = await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-07' }),
    );

    expect(result.openingBalance).toBe(800);
    expect(result.closingBalance).toBe(800);
  });

  it('buckets an invoice inflow and a purchase invoice outflow into the week matching their dueDate', async () => {
    const service = new ReportsFinancialService();
    const db = makeDb({
      invoices: [
        {
          id: 'inv-1',
          documentLetter: 'B',
          pointOfSale: '0001',
          number: '00000001',
          customerName: 'Cliente Demo SA',
          dueDate: new Date('2026-09-05'),
          balanceDue: new Prisma.Decimal(500),
        },
      ],
      purchaseInvoices: [
        {
          id: 'pinv-1',
          supplierInvoiceNumber: '0001-00001234',
          supplierName: 'Distribuidora Multi SA',
          dueDate: new Date('2026-09-12'),
          balanceDue: new Prisma.Decimal(300),
        },
      ],
    });

    const result = await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-14' }),
    );

    expect(result.totalInflows).toBe(500);
    expect(result.totalOutflows).toBe(300);
    expect(result.closingBalance).toBe(200);

    const week1 = result.weeks[0];
    expect(week1.weekStart).toBe('2026-09-01');
    expect(week1.weekEnd).toBe('2026-09-07');
    expect(week1.inflows).toBe(500);
    expect(week1.invoiceInflows).toEqual([
      expect.objectContaining({
        id: 'inv-1',
        reference: 'B-0001-00000001',
        counterparty: 'Cliente Demo SA',
        amount: 500,
      }),
    ]);

    const week2 = result.weeks[1];
    expect(week2.weekStart).toBe('2026-09-08');
    expect(week2.outflows).toBe(300);
    expect(week2.invoiceOutflows[0]).toMatchObject({
      reference: '0001-00001234',
      counterparty: 'Distribuidora Multi SA',
      amount: 300,
    });
    // Saldo acumulado al cierre de la semana 2 - opening (0) + 500 - 300.
    expect(week2.projectedBalance).toBe(200);
  });

  it('adds a third-party check in cartera to inflows and an issued own check to outflows', async () => {
    const service = new ReportsFinancialService();
    const db = makeDb({
      checks: [
        {
          id: 'chk-1',
          kind: 'THIRD_PARTY',
          status: 'PORTFOLIO',
          number: '00012345',
          dueDate: new Date('2026-09-03'),
          amount: new Prisma.Decimal(1000),
          customer: { name: 'Cliente Demo SA' },
          supplier: null,
        },
        {
          id: 'chk-2',
          kind: 'OWN',
          status: 'ISSUED',
          number: '00099999',
          dueDate: new Date('2026-09-04'),
          amount: new Prisma.Decimal(400),
          customer: null,
          supplier: { name: 'Distribuidora Multi SA' },
        },
      ],
    });

    const result = await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-07' }),
    );

    expect(result.totalInflows).toBe(1000);
    expect(result.totalOutflows).toBe(400);
    expect(result.weeks[0].checkInflows[0]).toMatchObject({
      reference: '00012345',
      counterparty: 'Cliente Demo SA',
      amount: 1000,
    });
    expect(result.weeks[0].checkOutflows[0]).toMatchObject({
      reference: '00099999',
      counterparty: 'Distribuidora Multi SA',
      amount: 400,
    });
  });

  it('clamps an overdue invoice and one with no dueDate into the first week', async () => {
    const service = new ReportsFinancialService();
    const db = makeDb({
      invoices: [
        {
          id: 'inv-overdue',
          documentLetter: 'B',
          pointOfSale: '0001',
          number: '00000002',
          customerName: 'Cliente Demo SA',
          dueDate: new Date('2026-08-01'), // antes del fromDate pedido
          balanceDue: new Prisma.Decimal(100),
        },
        {
          id: 'inv-no-due',
          documentLetter: 'B',
          pointOfSale: '0001',
          number: '00000003',
          customerName: 'Cliente Demo SA',
          dueDate: null,
          balanceDue: new Prisma.Decimal(50),
        },
      ],
    });

    const result = await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-07' }),
    );

    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].inflows).toBe(150);
    expect(result.weeks[0].invoiceInflows.map((i) => i.id)).toEqual(['inv-overdue', 'inv-no-due']);
  });

  it('excludes an invoice due after the requested horizon entirely', async () => {
    const service = new ReportsFinancialService();
    const db = makeDb({
      invoices: [
        {
          id: 'inv-far',
          documentLetter: 'B',
          pointOfSale: '0001',
          number: '00000004',
          customerName: 'Cliente Demo SA',
          dueDate: new Date('2026-12-01'),
          balanceDue: new Prisma.Decimal(999),
        },
      ],
    });

    const result = await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-07' }),
    );

    expect(result.totalInflows).toBe(0);
    expect(result.weeks[0].invoiceInflows).toEqual([]);
  });

  it('flags hasNegativeWeek when the projected balance dips below zero', async () => {
    const service = new ReportsFinancialService();
    const db = makeDb({
      accounts: [{ currentBalance: new Prisma.Decimal(100) }],
      purchaseInvoices: [
        {
          id: 'pinv-big',
          supplierInvoiceNumber: '0001-9999',
          supplierName: 'Distribuidora Multi SA',
          dueDate: new Date('2026-09-02'),
          balanceDue: new Prisma.Decimal(500),
        },
      ],
    });

    const result = await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-07' }),
    );

    expect(result.hasNegativeWeek).toBe(true);
    expect(result.closingBalance).toBe(-400);
  });

  it('queries invoices/purchase invoices only for outstanding, non-cancelled, base-currency balances (never re-filters in memory)', async () => {
    const service = new ReportsFinancialService();
    const invoiceFindMany = jest.fn().mockResolvedValue([]);
    const purchaseInvoiceFindMany = jest.fn().mockResolvedValue([]);
    const db = {
      financialAccount: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: invoiceFindMany },
      purchaseInvoice: { findMany: purchaseInvoiceFindMany },
      check: { findMany: jest.fn().mockResolvedValue([]) },
    };

    await runInTenant(db, () =>
      service.getCashflowProjection({ fromDate: '2026-09-01', toDate: '2026-09-07' }),
    );

    expect(invoiceFindMany).toHaveBeenCalledWith({
      where: {
        balanceDue: { gt: 0 },
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        currency: { isBase: true },
      },
    });
    expect(purchaseInvoiceFindMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 }, status: { not: 'CANCELLED' }, currency: { isBase: true } },
    });
  });

  it('defaults to a 30-day horizon from today when nothing is provided', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-15T12:00:00Z'));
    try {
      const service = new ReportsFinancialService();
      const result = await runInTenant(makeDb(), () => service.getCashflowProjection({}));
      expect(result.fromDate).toBe('2026-09-15');
      expect(result.toDate).toBe('2026-10-14');
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ReportsFinancialService.getReconciliationSummary', () => {
  it('throws when the account does not exist', async () => {
    const db = { financialAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new ReportsFinancialService();

    await expect(
      runInTenant(db, () => service.getReconciliationSummary('missing')),
    ).rejects.toThrow(NotFoundException);
  });

  it('computes pendingReconciliation as the book balance minus what is confirmed reconciled', async () => {
    const db = {
      financialAccount: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'acc-1', name: 'Main bank', currentBalance: new Prisma.Decimal(1000) }),
      },
      financialTransaction: {
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(700) } }) // reconciled
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(300) } }), // unreconciled
      },
    };
    const service = new ReportsFinancialService();

    const summary = await runInTenant(db, () => service.getReconciliationSummary('acc-1'));

    expect(summary.reconciledTotal.toNumber()).toBe(700);
    expect(summary.unreconciledTotal.toNumber()).toBe(300);
    expect(summary.pendingReconciliation.toNumber()).toBe(300);
  });
});
