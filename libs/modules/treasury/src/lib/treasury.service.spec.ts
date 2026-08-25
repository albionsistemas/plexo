import { BadRequestException, NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { CheckService } from './treasury.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const baseCheck = {
  id: 'chk-1',
  tenantId: 'tenant-1',
  kind: 'THIRD_PARTY' as const,
  format: 'PHYSICAL' as const,
  number: '00012345',
  bankName: 'Banco Galicia',
  amount: 1000,
  status: 'PORTFOLIO' as const,
  financialAccountId: null as string | null,
  receiptId: 'receipt-1',
  supplierPaymentId: null as string | null,
};

describe('CheckService.listChecks', () => {
  it('applies status/kind/bankName/due-date filters to the query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { check: { findMany } };
    const service = new CheckService();

    const dueFrom = new Date('2026-08-01');
    const dueTo = new Date('2026-08-31');
    await runInTenant(db, () =>
      service.listChecks({ status: 'PORTFOLIO', kind: 'THIRD_PARTY', bankName: 'galicia', dueFrom, dueTo }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: 'PORTFOLIO',
        kind: 'THIRD_PARTY',
        bankName: { contains: 'galicia', mode: 'insensitive' },
        dueDate: { gte: dueFrom, lte: dueTo },
      },
      orderBy: { dueDate: 'asc' },
    });
  });

  it('omits filters entirely when none are given', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { check: { findMany } };
    const service = new CheckService();

    await runInTenant(db, () => service.listChecks());

    expect(findMany).toHaveBeenCalledWith({ where: {}, orderBy: { dueDate: 'asc' } });
  });
});

describe('CheckService.getCheck', () => {
  it('throws NotFoundException when the check does not exist', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CheckService();

    await expect(runInTenant(db, () => service.getCheck('missing'))).rejects.toThrow(NotFoundException);
  });

  it('returns the check when found', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue(baseCheck) } };
    const service = new CheckService();

    await expect(runInTenant(db, () => service.getCheck('chk-1'))).resolves.toBe(baseCheck);
  });
});

describe('CheckService.registerThirdPartyCheck', () => {
  it('creates a THIRD_PARTY check in PORTFOLIO scoped to the current tenant', async () => {
    const create = jest.fn().mockResolvedValue({ ...baseCheck });
    const db = { check: { create } };
    const service = new CheckService();

    await runInTenant(db, () =>
      service.registerThirdPartyCheck({
        receiptId: 'receipt-1',
        customerId: 'customer-1',
        amount: 1000,
        number: '00012345',
        bankName: 'Banco Galicia',
        issueDate: new Date('2026-08-20'),
        dueDate: new Date('2026-09-20'),
        createdByUserId: 'user-1',
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        kind: 'THIRD_PARTY',
        format: 'PHYSICAL',
        status: 'PORTFOLIO',
        receiptId: 'receipt-1',
        customerId: 'customer-1',
      }),
    });
  });
});

describe('CheckService.depositCheck', () => {
  it('rejects depositing an OWN check', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, kind: 'OWN' }) } };
    const service = new CheckService();

    await expect(runInTenant(db, () => service.depositCheck('chk-1', 'acc-1'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects depositing a check that is not in PORTFOLIO', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status: 'DEPOSITED' }) } };
    const service = new CheckService();

    await expect(runInTenant(db, () => service.depositCheck('chk-1', 'acc-1'))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('moves a PORTFOLIO check to DEPOSITED against the given account', async () => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, status: 'DEPOSITED', financialAccountId: 'acc-1' });
    const db = { check: { findUnique: jest.fn().mockResolvedValue(baseCheck), update } };
    const service = new CheckService();

    await runInTenant(db, () => service.depositCheck('chk-1', 'acc-1'));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'chk-1' },
      data: { status: 'DEPOSITED', financialAccountId: 'acc-1' },
    });
  });
});

describe('CheckService.endorseCheck', () => {
  it('rejects endorsing an OWN check', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, kind: 'OWN' }) } };
    const service = new CheckService();

    await expect(
      runInTenant(db, () => service.endorseCheck('chk-1', 'payment-1', 'supplier-1')),
    ).rejects.toThrow(BadRequestException);
  });

  it.each(['ENDORSED', 'CLEARED', 'REJECTED'] as const)(
    'rejects endorsing a check in %s status',
    async (status) => {
      const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status }) } };
      const service = new CheckService();

      await expect(
        runInTenant(db, () => service.endorseCheck('chk-1', 'payment-1', 'supplier-1')),
      ).rejects.toThrow(BadRequestException);
    },
  );

  it.each(['PORTFOLIO', 'DEPOSITED'] as const)('allows endorsing a %s check', async (status) => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, status: 'ENDORSED' });
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status }), update } };
    const service = new CheckService();

    await runInTenant(db, () => service.endorseCheck('chk-1', 'payment-1', 'supplier-1'));

    expect(update).toHaveBeenCalledWith({
      where: { id: 'chk-1' },
      data: { status: 'ENDORSED', supplierPaymentId: 'payment-1', supplierId: 'supplier-1' },
    });
  });
});

describe('CheckService.issueOwnCheck', () => {
  it('creates an OWN check in ISSUED scoped to the current tenant', async () => {
    const create = jest.fn().mockResolvedValue({ ...baseCheck, kind: 'OWN', status: 'ISSUED' });
    const db = { check: { create } };
    const service = new CheckService();

    await runInTenant(db, () =>
      service.issueOwnCheck({
        supplierPaymentId: 'payment-1',
        supplierId: 'supplier-1',
        amount: 500,
        number: '00099999',
        bankName: 'Banco Nación',
        issueDate: new Date('2026-08-20'),
        dueDate: new Date('2026-10-20'),
        createdByUserId: 'user-1',
      }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        kind: 'OWN',
        status: 'ISSUED',
        supplierPaymentId: 'payment-1',
        supplierId: 'supplier-1',
      }),
    });
  });
});

describe('CheckService.markCleared', () => {
  it('clears a THIRD_PARTY check from DEPOSITED', async () => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, status: 'CLEARED' });
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status: 'DEPOSITED' }), update } };
    const service = new CheckService();

    await runInTenant(db, () => service.markCleared('chk-1'));

    expect(update).toHaveBeenCalledWith({ where: { id: 'chk-1' }, data: { status: 'CLEARED' } });
  });

  it('rejects clearing a THIRD_PARTY check still in PORTFOLIO', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue(baseCheck) } };
    const service = new CheckService();

    await expect(runInTenant(db, () => service.markCleared('chk-1'))).rejects.toThrow(BadRequestException);
  });

  it('requires a financialAccountId to clear an OWN check', async () => {
    const db = {
      check: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...baseCheck, kind: 'OWN', status: 'ISSUED', financialAccountId: null }),
      },
    };
    const service = new CheckService();

    await expect(runInTenant(db, () => service.markCleared('chk-1'))).rejects.toThrow(BadRequestException);
  });

  it('clears an OWN check from ISSUED when a financialAccountId is set', async () => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, kind: 'OWN', status: 'CLEARED' });
    const db = {
      check: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...baseCheck, kind: 'OWN', status: 'ISSUED', financialAccountId: 'acc-1' }),
        update,
      },
    };
    const service = new CheckService();

    await runInTenant(db, () => service.markCleared('chk-1'));

    expect(update).toHaveBeenCalledWith({ where: { id: 'chk-1' }, data: { status: 'CLEARED' } });
  });
});

describe('CheckService.rejectCheck', () => {
  it('rejects rejecting an OWN check', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, kind: 'OWN' }) } };
    const service = new CheckService();

    await expect(
      runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a check already CLEARED', async () => {
    const db = { check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status: 'CLEARED' }) } };
    const service = new CheckService();

    await expect(
      runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' })),
    ).rejects.toThrow(BadRequestException);
  });

  it('reports wasDeposited: false when rejecting a check still in PORTFOLIO', async () => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, status: 'REJECTED' });
    const db = { check: { findUnique: jest.fn().mockResolvedValue(baseCheck), update } };
    const service = new CheckService();

    const result = await runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' }));

    expect(result.wasDeposited).toBe(false);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'chk-1' },
      data: expect.objectContaining({ status: 'REJECTED', rejectionReason: 'sin fondos' }),
    });
  });

  it('reports wasDeposited: true when rejecting a check that had been DEPOSITED, carrying the fee', async () => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, status: 'REJECTED' });
    const db = {
      check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status: 'DEPOSITED' }), update },
    };
    const service = new CheckService();

    const result = await runInTenant(db, () =>
      service.rejectCheck('chk-1', { reason: 'sin fondos', feeAmount: 25 }),
    );

    expect(result.wasDeposited).toBe(true);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'chk-1' },
      data: expect.objectContaining({ rejectionFeeAmount: 25 }),
    });
  });

  it('allows rejecting an ENDORSED check', async () => {
    const update = jest.fn().mockResolvedValue({ ...baseCheck, status: 'REJECTED' });
    const db = {
      check: { findUnique: jest.fn().mockResolvedValue({ ...baseCheck, status: 'ENDORSED' }), update },
    };
    const service = new CheckService();

    const result = await runInTenant(db, () => service.rejectCheck('chk-1', { reason: 'sin fondos' }));

    expect(result.wasDeposited).toBe(false);
  });
});
