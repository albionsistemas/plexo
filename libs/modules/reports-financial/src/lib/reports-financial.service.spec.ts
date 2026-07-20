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
