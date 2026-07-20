import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma, tenantContextStorage } from '@plexo/database';
import { AccountingService } from './accounting.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T, userId = 'user-1'): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId, tx: db as never }, fn);
}

function runWithoutUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, fn);
}

describe('AccountingService.postJournalEntry', () => {
  const dto = {
    description: 'Sale on credit',
    lines: [
      { accountId: 'acc-ar', direction: 'DEBIT' as const, amount: 121 },
      { accountId: 'acc-sales', direction: 'CREDIT' as const, amount: 100 },
      { accountId: 'acc-vat', direction: 'CREDIT' as const, amount: 21 },
    ],
  };

  it('throws when there is no authenticated user', async () => {
    const service = new AccountingService();
    await expect(runWithoutUser({}, () => service.postJournalEntry(dto))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects an entry where debits and credits do not balance', async () => {
    const service = new AccountingService();
    const unbalanced = {
      description: 'Oops',
      lines: [
        { accountId: 'acc-a', direction: 'DEBIT' as const, amount: 100 },
        { accountId: 'acc-b', direction: 'CREDIT' as const, amount: 90 },
      ],
    };

    await expect(runInTenant({}, () => service.postJournalEntry(unbalanced))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('posts a balanced compound entry (one debit, two credits) as a single createMany', async () => {
    const journalEntry = { create: jest.fn().mockResolvedValue({ id: 'entry-1', lines: [] }) };
    const service = new AccountingService();

    await runInTenant({ journalEntry }, () => service.postJournalEntry(dto));

    const createArgs = (journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.createdById).toBe('user-1');
    expect(createArgs.data.lines.createMany.data).toHaveLength(3);
  });
});

describe('AccountingService.createReversingEntry', () => {
  it('throws when the original entry does not exist', async () => {
    const db = { journalEntry: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AccountingService();

    await expect(
      runInTenant(db, () => service.createReversingEntry({ originalEntryId: 'missing' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('swaps DEBIT/CREDIT on every line and links back via reversalOfId', async () => {
    const original = {
      id: 'entry-1',
      description: 'Sale on credit',
      lines: [
        { accountId: 'acc-ar', direction: 'DEBIT', amount: new Prisma.Decimal(121) },
        { accountId: 'acc-sales', direction: 'CREDIT', amount: new Prisma.Decimal(100) },
        { accountId: 'acc-vat', direction: 'CREDIT', amount: new Prisma.Decimal(21) },
      ],
    };
    const db = {
      journalEntry: {
        findUnique: jest.fn().mockResolvedValue(original),
        create: jest.fn().mockResolvedValue({ id: 'entry-2', lines: [] }),
      },
    };
    const service = new AccountingService();

    await runInTenant(db, () => service.createReversingEntry({ originalEntryId: 'entry-1' }));

    const createArgs = (db.journalEntry.create as jest.Mock).mock.calls[0][0];
    expect(createArgs.data.reversalOfId).toBe('entry-1');
    expect(createArgs.data.description).toBe('Reversal of: Sale on credit');
    expect(createArgs.data.lines.createMany.data).toEqual([
      { tenantId: 'tenant-1', accountId: 'acc-ar', direction: 'CREDIT', amount: original.lines[0].amount },
      { tenantId: 'tenant-1', accountId: 'acc-sales', direction: 'DEBIT', amount: original.lines[1].amount },
      { tenantId: 'tenant-1', accountId: 'acc-vat', direction: 'DEBIT', amount: original.lines[2].amount },
    ]);
  });
});

describe('AccountingService.getTrialBalance', () => {
  it('nets debit-normal and credit-normal accounts with opposite signs', async () => {
    const db = {
      accountingAccount: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'acc-cash', code: '1000', name: 'Cash', type: 'ASSET' },
          { id: 'acc-sales', code: '4000', name: 'Sales', type: 'INCOME' },
        ]),
      },
      journalEntryLine: {
        groupBy: jest.fn().mockResolvedValue([
          { accountId: 'acc-cash', direction: 'DEBIT', _sum: { amount: new Prisma.Decimal(500) } },
          { accountId: 'acc-cash', direction: 'CREDIT', _sum: { amount: new Prisma.Decimal(200) } },
          { accountId: 'acc-sales', direction: 'CREDIT', _sum: { amount: new Prisma.Decimal(300) } },
        ]),
      },
    };
    const service = new AccountingService();

    const trialBalance = await runInTenant(db, () => service.getTrialBalance());

    const cash = trialBalance.find((r) => r.accountId === 'acc-cash');
    const sales = trialBalance.find((r) => r.accountId === 'acc-sales');
    // ASSET is debit-normal: 500 debit - 200 credit = 300
    expect(cash?.balance.toNumber()).toBe(300);
    // INCOME is credit-normal: 300 credit - 0 debit = 300
    expect(sales?.balance.toNumber()).toBe(300);
  });

  it('defaults an account with no postings yet to a zero balance', async () => {
    const db = {
      accountingAccount: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'acc-new', code: '5000', name: 'Unused', type: 'EXPENSE' }]),
      },
      journalEntryLine: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    const service = new AccountingService();

    const trialBalance = await runInTenant(db, () => service.getTrialBalance());

    expect(trialBalance[0].balance.toNumber()).toBe(0);
  });
});

describe('AccountingService.getAccountLedger', () => {
  it('throws when the account does not exist', async () => {
    const db = { accountingAccount: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new AccountingService();

    await expect(runInTenant(db, () => service.getAccountLedger('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });
});
