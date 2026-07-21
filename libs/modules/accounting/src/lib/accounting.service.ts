import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  getUserId,
  isDebitNormal,
  Prisma,
  type AccountingAccount,
  type AccountType,
  type JournalEntry,
  type JournalEntryLine,
} from '@plexo/database';
import type { CreateAccountDto } from './dto/create-account.dto.js';
import type { CreateReversingEntryDto } from './dto/create-reversing-entry.dto.js';
import type { PostJournalEntryDto } from './dto/post-journal-entry.dto.js';

type JournalEntryWithLines = JournalEntry & { lines: JournalEntryLine[] };

/** System accounts auto-posting resolves by code, creating them on first
 * use if a tenant hasn't set up its chart of accounts yet. Codes/names are
 * just sensible AR-flavored defaults - nothing stops an accountant from
 * renaming the account afterwards, the code is what auto-posting keys on. */
const SALES_REVENUE_ACCOUNT = { code: '4.1.01', name: 'Ventas', type: 'INCOME' as const };
const ACCOUNTS_RECEIVABLE_ACCOUNT = {
  code: '1.1.02',
  name: 'Deudores por Ventas',
  type: 'ASSET' as const,
};
const VAT_PAYABLE_ACCOUNT = {
  code: '2.1.03',
  name: 'IVA Débito Fiscal',
  type: 'LIABILITY' as const,
};

export interface PostInvoiceJournalEntryInput {
  invoiceId: string;
  subtotal: Prisma.Decimal | number | string;
  taxTotal: Prisma.Decimal | number | string;
  total: Prisma.Decimal | number | string;
  date?: Date;
}

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debitTotal: Prisma.Decimal;
  creditTotal: Prisma.Decimal;
  balance: Prisma.Decimal;
}

@Injectable()
export class AccountingService {
  createAccount(dto: CreateAccountDto): Promise<AccountingAccount> {
    return getTenantDb().accountingAccount.create({
      data: { tenantId: getTenantId(), code: dto.code, name: dto.name, type: dto.type },
    });
  }

  listAccounts(): Promise<AccountingAccount[]> {
    return getTenantDb().accountingAccount.findMany({ orderBy: { code: 'asc' } });
  }

  listJournalEntries(): Promise<JournalEntryWithLines[]> {
    return getTenantDb().journalEntry.findMany({
      include: { lines: true },
      orderBy: { date: 'desc' },
    });
  }

  async getJournalEntry(id: string): Promise<JournalEntryWithLines> {
    const entry = await getTenantDb().journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }
    return entry;
  }

  /**
   * Posts entry + lines atomically (same per-request transaction as
   * everything else via getTenantDb()) after checking the fundamental
   * double-entry invariant: total debits must equal total credits. Once
   * posted, the journal_entry_lock trigger makes both the entry and its
   * lines immutable - see createReversingEntry() for how corrections work.
   */
  async postJournalEntry(dto: PostJournalEntryDto): Promise<JournalEntryWithLines> {
    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    for (const line of dto.lines) {
      const amount = new Prisma.Decimal(line.amount);
      if (line.direction === 'DEBIT') {
        debitTotal = debitTotal.add(amount);
      } else {
        creditTotal = creditTotal.add(amount);
      }
    }

    if (!debitTotal.eq(creditTotal)) {
      throw new BadRequestException(
        `Journal entry is not balanced: debits ${debitTotal.toFixed(2)} != credits ${creditTotal.toFixed(2)}`,
      );
    }

    return getTenantDb().journalEntry.create({
      data: {
        tenantId,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : undefined,
        invoiceId: dto.invoiceId,
        createdById,
        lines: {
          createMany: {
            data: dto.lines.map((line) => ({
              tenantId,
              accountId: line.accountId,
              direction: line.direction,
              amount: line.amount,
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  private async getOrCreateAccount(spec: {
    code: string;
    name: string;
    type: AccountType;
  }): Promise<AccountingAccount> {
    const db = getTenantDb();
    const existing = await db.accountingAccount.findFirst({ where: { code: spec.code } });
    if (existing) {
      return existing;
    }
    return db.accountingAccount.create({
      data: { tenantId: getTenantId(), code: spec.code, name: spec.name, type: spec.type },
    });
  }

  /**
   * Auto-posting entry point for the sales flow: called by SalesService
   * (apps/api) right after an invoice is created, in the same per-request
   * transaction, so a rollback of one rolls back the other. Books the
   * standard accrual sale - debit Accounts Receivable for the full total,
   * credit Sales Revenue for the pre-tax subtotal, credit VAT payable for
   * the tax - which is always balanced by construction, since
   * Invoice.total is defined as subtotal + taxTotal. Reuses
   * postJournalEntry()'s balance check as a defense-in-depth sanity check,
   * not because it's expected to ever fail here.
   *
   * Resolves accounts by well-known code, creating them tenant-side on
   * first use - see the *_ACCOUNT constants above. A tenant that already
   * created its own account with one of those codes (e.g. via
   * POST /accounting/accounts) gets that account reused instead.
   *
   * Skips posting entirely for a zero-total invoice (nothing financial
   * happened) rather than writing a degenerate zero-amount entry.
   */
  async postInvoiceJournalEntry(
    input: PostInvoiceJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const subtotal = new Prisma.Decimal(input.subtotal);
    const taxTotal = new Prisma.Decimal(input.taxTotal);

    const [ar, revenue, vat] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
      this.getOrCreateAccount(SALES_REVENUE_ACCOUNT),
      taxTotal.gt(0) ? this.getOrCreateAccount(VAT_PAYABLE_ACCOUNT) : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: ar.id, direction: 'DEBIT', amount: total.toNumber() },
      { accountId: revenue.id, direction: 'CREDIT', amount: subtotal.toNumber() },
    ];
    if (vat && taxTotal.gt(0)) {
      lines.push({ accountId: vat.id, direction: 'CREDIT', amount: taxTotal.toNumber() });
    }

    return this.postJournalEntry({
      description: `Venta - comprobante ${input.invoiceId}`,
      date: input.date?.toISOString(),
      invoiceId: input.invoiceId,
      lines,
    });
  }

  /** The only way to correct a posted entry: a new entry with the same
   * lines, DEBIT/CREDIT swapped, linked back via reversalOfId. Never an
   * UPDATE to the original - the DB trigger wouldn't allow it anyway. */
  async createReversingEntry(dto: CreateReversingEntryDto): Promise<JournalEntryWithLines> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    const original = await db.journalEntry.findUnique({
      where: { id: dto.originalEntryId },
      include: { lines: true },
    });
    if (!original) {
      throw new NotFoundException('Journal entry not found');
    }

    return db.journalEntry.create({
      data: {
        tenantId,
        description: dto.description ?? `Reversal of: ${original.description}`,
        createdById,
        reversalOfId: original.id,
        lines: {
          createMany: {
            data: original.lines.map((line) => ({
              tenantId,
              accountId: line.accountId,
              direction: line.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
              amount: line.amount,
            })),
          },
        },
      },
      include: { lines: true },
    });
  }

  /** Net balance per account, using the standard debit/credit-normal sign
   * convention by account type - not a stored figure, always derived from
   * journal_entry_lines so it can never drift from the ledger. */
  async getTrialBalance(): Promise<TrialBalanceRow[]> {
    const db = getTenantDb();
    const accounts = await db.accountingAccount.findMany({ orderBy: { code: 'asc' } });
    const grouped = await db.journalEntryLine.groupBy({
      by: ['accountId', 'direction'],
      _sum: { amount: true },
    });

    const totalsByAccount = new Map<string, { debit: Prisma.Decimal; credit: Prisma.Decimal }>();
    for (const row of grouped) {
      const entry = totalsByAccount.get(row.accountId) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const sum = row._sum.amount ?? new Prisma.Decimal(0);
      if (row.direction === 'DEBIT') {
        entry.debit = entry.debit.add(sum);
      } else {
        entry.credit = entry.credit.add(sum);
      }
      totalsByAccount.set(row.accountId, entry);
    }

    return accounts.map((account) => {
      const totals = totalsByAccount.get(account.id) ?? {
        debit: new Prisma.Decimal(0),
        credit: new Prisma.Decimal(0),
      };
      const balance = isDebitNormal(account.type)
        ? totals.debit.sub(totals.credit)
        : totals.credit.sub(totals.debit);

      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        debitTotal: totals.debit,
        creditTotal: totals.credit,
        balance,
      };
    });
  }

  async getAccountLedger(accountId: string) {
    const db = getTenantDb();
    const account = await db.accountingAccount.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }

    const lines = await db.journalEntryLine.findMany({
      where: { accountId },
      include: { journalEntry: true },
      orderBy: { journalEntry: { date: 'asc' } },
    });

    return { accountId, code: account.code, name: account.name, lines };
  }
}
