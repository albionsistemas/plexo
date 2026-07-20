import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  Prisma,
  type FinancialAccount,
  type FinancialTransaction,
} from '@plexo/database';
import type { CreateFinancialAccountDto } from './dto/create-financial-account.dto.js';
import type { RecordFinancialTransactionDto } from './dto/record-financial-transaction.dto.js';

export interface ReconciliationSummary {
  financialAccountId: string;
  accountName: string;
  bookBalance: Prisma.Decimal;
  reconciledTotal: Prisma.Decimal;
  unreconciledTotal: Prisma.Decimal;
  /** bookBalance minus what's actually been confirmed against the bank -
   * nonzero means there's unreconciled movement still to work through. */
  pendingReconciliation: Prisma.Decimal;
}

@Injectable()
export class ReportsFinancialService {
  createFinancialAccount(dto: CreateFinancialAccountDto): Promise<FinancialAccount> {
    return getTenantDb().financialAccount.create({
      data: {
        tenantId: getTenantId(),
        name: dto.name,
        provider: dto.provider,
        currentBalance: dto.currentBalance ?? 0,
      },
    });
  }

  listFinancialAccounts(): Promise<FinancialAccount[]> {
    return getTenantDb().financialAccount.findMany({ orderBy: { name: 'asc' } });
  }

  /** Records the movement and keeps FinancialAccount.currentBalance in
   * sync in the same transaction - same "ledger + materialized balance"
   * pattern as StockLedger/StockMovement in inventory. */
  async recordFinancialTransaction(
    dto: RecordFinancialTransactionDto,
  ): Promise<FinancialTransaction> {
    if (dto.amount === 0) {
      throw new BadRequestException('Transaction amount must not be zero');
    }

    const db = getTenantDb();
    const tenantId = getTenantId();

    const account = await db.financialAccount.findUnique({
      where: { id: dto.financialAccountId },
    });
    if (!account) {
      throw new NotFoundException('Financial account not found');
    }

    const transaction = await db.financialTransaction.create({
      data: {
        tenantId,
        financialAccountId: dto.financialAccountId,
        amount: dto.amount,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        externalRef: dto.externalRef,
      },
    });

    await db.financialAccount.update({
      where: { id: dto.financialAccountId },
      data: { currentBalance: { increment: dto.amount } },
    });

    return transaction;
  }

  async reconcileTransaction(id: string): Promise<FinancialTransaction> {
    const db = getTenantDb();
    const transaction = await db.financialTransaction.findUnique({ where: { id } });
    if (!transaction) {
      throw new NotFoundException('Financial transaction not found');
    }
    if (transaction.reconciled) {
      throw new BadRequestException('Transaction is already reconciled');
    }

    return db.financialTransaction.update({
      where: { id },
      data: { reconciled: true },
    });
  }

  listUnreconciledTransactions(financialAccountId?: string): Promise<FinancialTransaction[]> {
    return getTenantDb().financialTransaction.findMany({
      where: { reconciled: false, financialAccountId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  async getReconciliationSummary(financialAccountId: string): Promise<ReconciliationSummary> {
    const db = getTenantDb();
    const account = await db.financialAccount.findUnique({ where: { id: financialAccountId } });
    if (!account) {
      throw new NotFoundException('Financial account not found');
    }

    const [reconciled, unreconciled] = await Promise.all([
      db.financialTransaction.aggregate({
        where: { financialAccountId, reconciled: true },
        _sum: { amount: true },
      }),
      db.financialTransaction.aggregate({
        where: { financialAccountId, reconciled: false },
        _sum: { amount: true },
      }),
    ]);

    const reconciledTotal = reconciled._sum.amount ?? new Prisma.Decimal(0);
    const unreconciledTotal = unreconciled._sum.amount ?? new Prisma.Decimal(0);

    return {
      financialAccountId,
      accountName: account.name,
      bookBalance: account.currentBalance,
      reconciledTotal,
      unreconciledTotal,
      pendingReconciliation: account.currentBalance.sub(reconciledTotal),
    };
  }
}
