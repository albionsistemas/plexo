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
const COGS_EXPENSE_ACCOUNT = {
  code: '5.1.01',
  name: 'Costo de Mercadería Vendida',
  type: 'EXPENSE' as const,
};
const INVENTORY_ASSET_ACCOUNT = {
  code: '1.1.04',
  name: 'Mercaderías',
  type: 'ASSET' as const,
};

/** Compras / Cuentas a Pagar - GRNI (Goods Received Not Invoiced) bridge +
 * the accounts a Factura de Compra clears it into. See
 * postGoodsReceiptAccrual/reverseSupplierReturnAccrual/
 * postPurchaseInvoiceJournalEntry/postSupplierPaymentJournalEntry below. */
const GRNI_ACCOUNT = {
  code: '2.1.04',
  name: 'Mercadería Recibida No Facturada',
  type: 'LIABILITY' as const,
};
const ACCOUNTS_PAYABLE_ACCOUNT = { code: '2.1.05', name: 'Proveedores', type: 'LIABILITY' as const };
const VAT_CREDIT_ACCOUNT = {
  code: '1.1.05',
  name: 'IVA Crédito Fiscal',
  type: 'ASSET' as const,
};
const PERCEPTIONS_ACCOUNT = {
  code: '1.1.06',
  name: 'Percepciones Sufridas',
  type: 'ASSET' as const,
};
// Whatever a Factura de Compra covers that ISN'T backed by a GRNI accrual -
// a service line (Article.isService never gets a remito) or a price
// variance between the receipt's PO-cost accrual and what the supplier
// actually billed. One aggregate account for both cases, same criterion as
// COGS_EXPENSE_ACCOUNT being one account regardless of which product sold.
const PURCHASES_NO_RECEIPT_ACCOUNT = {
  code: '5.1.02',
  name: 'Compras sin remito',
  type: 'EXPENSE' as const,
};
// Reused as-is for supplier payments (Cr side) - same code an earlier
// session already created manually in this chart of accounts.
const CASH_ACCOUNT = { code: '1.1.03', name: 'Caja', type: 'ASSET' as const };

export interface PostInvoiceJournalEntryInput {
  invoiceId: string;
  subtotal: Prisma.Decimal | number | string;
  taxTotal: Prisma.Decimal | number | string;
  total: Prisma.Decimal | number | string;
  date?: Date;
  // Weighted-average cost of the goods sold in this invoice, computed by
  // SalesService from the unitCost each SALE_OUT movement was stamped
  // with. Optional/zero is common (uncosted variant, no purchase history
  // yet) and simply skips the COGS lines below - not an error.
  cogsAmount?: Prisma.Decimal | number | string;
}

export interface PostCreditNoteJournalEntryInput {
  creditNoteId: string;
  invoiceId: string;
  subtotal: Prisma.Decimal | number | string;
  taxTotal: Prisma.Decimal | number | string;
  total: Prisma.Decimal | number | string;
  date?: Date;
  // Cost of the credited (returned) quantity - same optional/zero-is-fine
  // treatment as postInvoiceJournalEntry's cogsAmount.
  cogsAmount?: Prisma.Decimal | number | string;
}

export interface PostGoodsReceiptAccrualInput {
  goodsReceiptId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface ReverseSupplierReturnAccrualInput {
  supplierReturnId: string;
  amount: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PurchaseInvoicePerceptionInput {
  concept: string;
  amount: Prisma.Decimal | number | string;
}

export interface PostPurchaseInvoiceJournalEntryInput {
  purchaseInvoiceId: string;
  // Portion of the invoice's subtotal backed by GRNI-accrued receipts -
  // clears (debits) that bridge liability. Zero for a pure-services
  // invoice with no linked GoodsReceipt.
  grniClearedAmount: Prisma.Decimal | number | string;
  // subtotal - grniClearedAmount: services or price variance not backed by
  // any receipt - see PURCHASES_NO_RECEIPT_ACCOUNT.
  nonGrniAmount: Prisma.Decimal | number | string;
  ivaCredito: Prisma.Decimal | number | string;
  percepciones: PurchaseInvoicePerceptionInput[];
  total: Prisma.Decimal | number | string;
  date?: Date;
}

export interface PostSupplierPaymentJournalEntryInput {
  supplierPaymentId: string;
  amount: Prisma.Decimal | number | string;
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
   * happened) rather than writing a degenerate zero-amount entry. Same
   * treatment for the optional COGS pair (debit Costo de Mercadería
   * Vendida / credit Mercaderías) - appended to this SAME entry rather
   * than a second one, since JournalEntry.invoiceId is @unique: a second
   * entry per invoice isn't possible without a schema change. The two COGS
   * lines always carry the identical amount to each other, so the
   * debit=credit balance holds regardless of whether they're present -
   * independent of the AR/revenue/VAT lines above.
   *
   * Credit notes do NOT reverse this entry (see postCreditNoteJournalEntry
   * below) - invoiceId being @unique means only one entry can ever exist
   * per invoice, so a credit note (possibly partial, possibly more than
   * one over time) posts its own independent entry instead.
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
    const cogsAmount = new Prisma.Decimal(input.cogsAmount ?? 0);

    const [ar, revenue, vat, cogsAccounts] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
      this.getOrCreateAccount(SALES_REVENUE_ACCOUNT),
      taxTotal.gt(0) ? this.getOrCreateAccount(VAT_PAYABLE_ACCOUNT) : Promise.resolve(undefined),
      cogsAmount.gt(0)
        ? Promise.all([
            this.getOrCreateAccount(COGS_EXPENSE_ACCOUNT),
            this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
          ])
        : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: ar.id, direction: 'DEBIT', amount: total.toNumber() },
      { accountId: revenue.id, direction: 'CREDIT', amount: subtotal.toNumber() },
    ];
    if (vat && taxTotal.gt(0)) {
      lines.push({ accountId: vat.id, direction: 'CREDIT', amount: taxTotal.toNumber() });
    }
    if (cogsAccounts && cogsAmount.gt(0)) {
      const [cogs, inventory] = cogsAccounts;
      lines.push({ accountId: cogs.id, direction: 'DEBIT', amount: cogsAmount.toNumber() });
      lines.push({ accountId: inventory.id, direction: 'CREDIT', amount: cogsAmount.toNumber() });
    }

    return this.postJournalEntry({
      description: `Venta - comprobante ${input.invoiceId}`,
      date: input.date?.toISOString(),
      invoiceId: input.invoiceId,
      lines,
    });
  }

  /**
   * Auto-posting entry point for credit notes - called by SalesService
   * .voidSale() (apps/api) right after InvoicingService.createCreditNote(),
   * same per-request transaction as everything else. Deliberately does NOT
   * use createReversingEntry()/mirror postInvoiceJournalEntry's entry: a
   * credit note can be partial (crediting only some quantity of some
   * lines), and both invoiceId and reversalOfId are @unique on
   * JournalEntry - a second partial credit note on the same invoice
   * couldn't link back to the same original sale entry either way. Instead
   * this posts its own independently-balanced entry, resolved later by
   * creditNoteId (also @unique - one entry per credit note).
   *
   * Books the mirror image of postInvoiceJournalEntry: credit Accounts
   * Receivable (the customer owes less), debit Sales Revenue and VAT
   * Payable (both go down), and - if the credited quantity had a cost
   * basis - credit Costo de Mercadería Vendida / debit Mercaderías (the
   * expense reverses, the goods are back in stock). Balanced by
   * construction the same way the sale side is: creditNote.total is
   * defined as subtotal + taxTotal, and the COGS pair always carries the
   * same amount on both sides.
   *
   * Skips posting entirely for a zero-total credit note (shouldn't happen -
   * CreateCreditNoteDto requires at least one line - but mirrors
   * postInvoiceJournalEntry's defensive skip rather than writing a
   * degenerate entry).
   */
  async postCreditNoteJournalEntry(
    input: PostCreditNoteJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const subtotal = new Prisma.Decimal(input.subtotal);
    const taxTotal = new Prisma.Decimal(input.taxTotal);
    const cogsAmount = new Prisma.Decimal(input.cogsAmount ?? 0);

    const [ar, revenue, vat, cogsAccounts] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_RECEIVABLE_ACCOUNT),
      this.getOrCreateAccount(SALES_REVENUE_ACCOUNT),
      taxTotal.gt(0) ? this.getOrCreateAccount(VAT_PAYABLE_ACCOUNT) : Promise.resolve(undefined),
      cogsAmount.gt(0)
        ? Promise.all([
            this.getOrCreateAccount(COGS_EXPENSE_ACCOUNT),
            this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
          ])
        : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: ar.id, direction: 'CREDIT', amount: total.toNumber() },
      { accountId: revenue.id, direction: 'DEBIT', amount: subtotal.toNumber() },
    ];
    if (vat && taxTotal.gt(0)) {
      lines.push({ accountId: vat.id, direction: 'DEBIT', amount: taxTotal.toNumber() });
    }
    if (cogsAccounts && cogsAmount.gt(0)) {
      const [cogs, inventory] = cogsAccounts;
      lines.push({ accountId: cogs.id, direction: 'CREDIT', amount: cogsAmount.toNumber() });
      lines.push({ accountId: inventory.id, direction: 'DEBIT', amount: cogsAmount.toNumber() });
    }

    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    for (const line of lines) {
      const amount = new Prisma.Decimal(line.amount);
      if (line.direction === 'DEBIT') {
        debitTotal = debitTotal.add(amount);
      } else {
        creditTotal = creditTotal.add(amount);
      }
    }
    if (!debitTotal.eq(creditTotal)) {
      throw new BadRequestException(
        `Credit note journal entry is not balanced: debits ${debitTotal.toFixed(2)} != credits ${creditTotal.toFixed(2)}`,
      );
    }

    return getTenantDb().journalEntry.create({
      data: {
        tenantId,
        description: `Nota de crédito - comprobante ${input.invoiceId}`,
        date: input.date,
        creditNoteId: input.creditNoteId,
        createdById,
        lines: {
          createMany: {
            data: lines.map((line) => ({
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

  /** Shared by the 4 Compras/Cuentas a Pagar posting methods below - same
   * balance-check-then-create shape as postJournalEntry(), duplicated
   * rather than reused because PostJournalEntryDto (the public "asiento
   * manual" endpoint's DTO) only accepts invoiceId, not these newer FKs -
   * same reason postCreditNoteJournalEntry already has its own inline
   * balance check instead of calling postJournalEntry(). Widening that
   * DTO would let a manually-posted entry claim one of these FKs from the
   * public API, which isn't something a user should be able to do by hand. */
  private async createBalancedEntry(
    description: string,
    lines: PostJournalEntryDto['lines'],
    opts: {
      date?: Date;
      goodsReceiptId?: string;
      supplierReturnId?: string;
      purchaseInvoiceId?: string;
      supplierPaymentId?: string;
    },
  ): Promise<JournalEntryWithLines> {
    const tenantId = getTenantId();
    const createdById = getUserId();
    if (!createdById) {
      throw new BadRequestException('An authenticated user is required to post a journal entry');
    }

    let debitTotal = new Prisma.Decimal(0);
    let creditTotal = new Prisma.Decimal(0);
    for (const line of lines) {
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
        description,
        date: opts.date,
        goodsReceiptId: opts.goodsReceiptId,
        supplierReturnId: opts.supplierReturnId,
        purchaseInvoiceId: opts.purchaseInvoiceId,
        supplierPaymentId: opts.supplierPaymentId,
        createdById,
        lines: {
          createMany: {
            data: lines.map((line) => ({
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

  /**
   * Posted when a GoodsReceipt (remito) is recorded, in the same
   * transaction as the stock movement it drives (see apps/api's
   * GoodsReceiptsService) - the GRNI accrual: we now hold the goods
   * (debit Mercaderías) but haven't seen the supplier's invoice yet
   * (credit the GRNI bridge liability instead of Proveedores directly).
   * Cleared later by postPurchaseInvoiceJournalEntry. Skipped for a
   * zero-amount receipt (shouldn't happen - a PurchaseOrderLine always has
   * a real unitCost - but mirrors the other post* methods' defensive skip).
   */
  async postGoodsReceiptAccrual(
    input: PostGoodsReceiptAccrualInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [inventory, grni] = await Promise.all([
      this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
      this.getOrCreateAccount(GRNI_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Recepción de mercadería - remito ${input.goodsReceiptId}`,
      [
        { accountId: inventory.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: grni.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, goodsReceiptId: input.goodsReceiptId },
    );
  }

  /**
   * Posted when a SupplierReturn is recorded against a remito that already
   * accrued GRNI - mirror image of postGoodsReceiptAccrual for the
   * returned quantity's cost: the goods are going back (credit
   * Mercaderías) and we owe the supplier that much less once invoiced
   * (debit down the GRNI bridge). Its own independent entry, not
   * createReversingEntry() against the original accrual - same reason
   * postCreditNoteJournalEntry doesn't mirror postInvoiceJournalEntry:
   * this is a partial amount tied to specific returned lines, not
   * necessarily the whole receipt.
   */
  async reverseSupplierReturnAccrual(
    input: ReverseSupplierReturnAccrualInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [inventory, grni] = await Promise.all([
      this.getOrCreateAccount(INVENTORY_ASSET_ACCOUNT),
      this.getOrCreateAccount(GRNI_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Devolución a proveedor - ${input.supplierReturnId}`,
      [
        { accountId: grni.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: inventory.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, supplierReturnId: input.supplierReturnId },
    );
  }

  /**
   * Posted when a Factura de Compra is created (see apps/api's
   * PurchaseInvoicesService, composing PurchaseInvoiceService +
   * AccountingService). Clears the GRNI bridge for whatever this invoice
   * settles (debit GRNI), books whatever isn't backed by a receipt as an
   * expense (services, price variance - debit Compras sin remito), books
   * the real fiscal detail the supplier's invoice carries (debit IVA
   * Crédito Fiscal, debit Percepciones Sufridas - aggregate accounts, the
   * per-concept detail lives on PurchaseInvoiceTaxLine), and credits
   * Proveedores for the total now owed. Balanced by construction: the
   * composition root computes grniClearedAmount + nonGrniAmount as an
   * exact split of the invoice's subtotal, so
   * grniClearedAmount + nonGrniAmount + ivaCredito + Σpercepciones ==
   * total always holds - createBalancedEntry's check is a defense-in-depth
   * safety net, not expected to ever fire here.
   */
  async postPurchaseInvoiceJournalEntry(
    input: PostPurchaseInvoiceJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const total = new Prisma.Decimal(input.total);
    if (total.lte(0)) {
      return undefined;
    }
    const grniClearedAmount = new Prisma.Decimal(input.grniClearedAmount);
    const nonGrniAmount = new Prisma.Decimal(input.nonGrniAmount);
    const ivaCredito = new Prisma.Decimal(input.ivaCredito);
    const percepcionesTotal = input.percepciones.reduce(
      (sum, p) => sum.add(new Prisma.Decimal(p.amount)),
      new Prisma.Decimal(0),
    );

    const [payable, grni, expense, vatCredit, perceptions] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT),
      grniClearedAmount.gt(0) ? this.getOrCreateAccount(GRNI_ACCOUNT) : Promise.resolve(undefined),
      nonGrniAmount.gt(0)
        ? this.getOrCreateAccount(PURCHASES_NO_RECEIPT_ACCOUNT)
        : Promise.resolve(undefined),
      ivaCredito.gt(0) ? this.getOrCreateAccount(VAT_CREDIT_ACCOUNT) : Promise.resolve(undefined),
      percepcionesTotal.gt(0) ? this.getOrCreateAccount(PERCEPTIONS_ACCOUNT) : Promise.resolve(undefined),
    ]);

    const lines: PostJournalEntryDto['lines'] = [
      { accountId: payable.id, direction: 'CREDIT', amount: total.toNumber() },
    ];
    if (grni && grniClearedAmount.gt(0)) {
      lines.push({ accountId: grni.id, direction: 'DEBIT', amount: grniClearedAmount.toNumber() });
    }
    if (expense && nonGrniAmount.gt(0)) {
      lines.push({ accountId: expense.id, direction: 'DEBIT', amount: nonGrniAmount.toNumber() });
    }
    if (vatCredit && ivaCredito.gt(0)) {
      lines.push({ accountId: vatCredit.id, direction: 'DEBIT', amount: ivaCredito.toNumber() });
    }
    if (perceptions && percepcionesTotal.gt(0)) {
      lines.push({ accountId: perceptions.id, direction: 'DEBIT', amount: percepcionesTotal.toNumber() });
    }

    return this.createBalancedEntry(
      `Factura de compra - comprobante ${input.purchaseInvoiceId}`,
      lines,
      { date: input.date, purchaseInvoiceId: input.purchaseInvoiceId },
    );
  }

  /**
   * Posted when a SupplierPayment is recorded (see apps/api's
   * PurchaseInvoicesService.recordPayment) - debit Proveedores (we owe
   * less), credit Caja for the amount paid. Unlike Receipt (the AR
   * equivalent, whose recordReceipt does NOT post anything today - a
   * separate, already-flagged gap), this posts every time: without it,
   * Proveedores would only ever grow from postPurchaseInvoiceJournalEntry
   * and never shrink, reproducing the exact same class of bug this whole
   * feature exists to fix for Mercaderías.
   */
  async postSupplierPaymentJournalEntry(
    input: PostSupplierPaymentJournalEntryInput,
  ): Promise<JournalEntryWithLines | undefined> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      return undefined;
    }
    const [payable, cash] = await Promise.all([
      this.getOrCreateAccount(ACCOUNTS_PAYABLE_ACCOUNT),
      this.getOrCreateAccount(CASH_ACCOUNT),
    ]);
    return this.createBalancedEntry(
      `Pago a proveedor - ${input.supplierPaymentId}`,
      [
        { accountId: payable.id, direction: 'DEBIT', amount: amount.toNumber() },
        { accountId: cash.id, direction: 'CREDIT', amount: amount.toNumber() },
      ],
      { date: input.date, supplierPaymentId: input.supplierPaymentId },
    );
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
