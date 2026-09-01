import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  Prisma,
  type FinancialAccount,
  type FinancialTransaction,
} from '@plexo/database';
import type { CashflowLineItem, CashflowProjection, CashflowWeekBucket } from './cashflow-projection.types.js';
import type { CashflowProjectionQueryDto } from './dto/cashflow-projection-query.dto.js';
import type { CreateFinancialAccountDto } from './dto/create-financial-account.dto.js';
import type { RecordFinancialTransactionDto } from './dto/record-financial-transaction.dto.js';
import type { TransferBetweenAccountsDto } from './dto/transfer-between-accounts.dto.js';

function dateOnlyUTC(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface WeekAccumulator {
  weekStart: Date;
  weekEnd: Date;
  inflows: Prisma.Decimal;
  outflows: Prisma.Decimal;
  invoiceInflows: CashflowLineItem[];
  checkInflows: CashflowLineItem[];
  invoiceOutflows: CashflowLineItem[];
  checkOutflows: CashflowLineItem[];
}

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

  /** Transferencia interna entre dos cuentas propias (ej. Caja Efectivo ->
   * Banco Galicia) - dos FinancialTransaction balanceadas (débito en
   * origen, crédito en destino, mismo monto), cada una manteniendo su
   * propio currentBalance en sync vía recordFinancialTransaction (mismo
   * ledger de siempre, no un mecanismo aparte). No es un asiento contable
   * de partida doble (AccountingService no participa) - mover plata entre
   * dos cuentas propias no cambia el Plan de Cuentas del tenant, sólo qué
   * FinancialAccount la tiene. */
  async transferBetweenAccounts(
    dto: TransferBetweenAccountsDto,
  ): Promise<{ from: FinancialTransaction; to: FinancialTransaction }> {
    if (dto.fromFinancialAccountId === dto.toFinancialAccountId) {
      throw new BadRequestException('La cuenta de origen y destino no pueden ser la misma');
    }
    const [fromAccount, toAccount] = await Promise.all([
      getTenantDb().financialAccount.findUnique({ where: { id: dto.fromFinancialAccountId } }),
      getTenantDb().financialAccount.findUnique({ where: { id: dto.toFinancialAccountId } }),
    ]);
    if (!fromAccount) {
      throw new NotFoundException('Origin financial account not found');
    }
    if (!toAccount) {
      throw new NotFoundException('Destination financial account not found');
    }

    const from = await this.recordFinancialTransaction({
      financialAccountId: dto.fromFinancialAccountId,
      amount: -dto.amount,
      occurredAt: dto.occurredAt,
      externalRef: `Transferencia a ${toAccount.name}${dto.note ? ` - ${dto.note}` : ''}`,
    });
    const to = await this.recordFinancialTransaction({
      financialAccountId: dto.toFinancialAccountId,
      amount: dto.amount,
      occurredAt: dto.occurredAt,
      externalRef: `Transferencia desde ${fromAccount.name}${dto.note ? ` - ${dto.note}` : ''}`,
    });

    return { from, to };
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

  /** Extracto completo de una cuenta (conciliados y no) - a diferencia de
   * listUnreconciledTransactions, que sólo alimenta el flujo de
   * conciliación, esto es la vista "cronológica de movimientos" que pide
   * el detalle de Tesorería. */
  async listTransactions(financialAccountId: string): Promise<FinancialTransaction[]> {
    const account = await getTenantDb().financialAccount.findUnique({
      where: { id: financialAccountId },
    });
    if (!account) {
      throw new NotFoundException('Financial account not found');
    }
    return getTenantDb().financialTransaction.findMany({
      where: { financialAccountId },
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

  /**
   * Flujo de caja proyectado: disponibilidad inicial (suma de
   * FinancialAccount.currentBalance - no hay campo "activa/inactiva" en
   * este schema, así que son todas) + lo que se espera cobrar/pagar dentro
   * del horizonte pedido, agrupado por semana. Deliberadamente NO incluye
   * cheques de terceros ya DEPOSITED/CLEARED ni propios ya CLEARED - esos
   * ya están adentro de currentBalance (TreasuryService los acredita/debita
   * en el momento, ver treasury.service.ts), contarlos de nuevo acá sería
   * duplicar plata. Sólo PORTFOLIO (terceros) e ISSUED (propios) son
   * todavía "el futuro".
   *
   * Nunca importa @plexo/invoicing/@plexo/purchases/@plexo/treasury -
   * consulta Invoice/PurchaseInvoice/Check directo por getTenantDb(), mismo
   * criterio que el resto de @plexo/reports-financial (regla del repo: un
   * lib module nunca importa el Service de otro).
   *
   * Sólo moneda base: FinancialAccount no tiene currencyId (ver schema.prisma)
   * - currentBalance no está atado a ninguna moneda declarada, así que no hay
   * forma correcta de convertir un balanceDue en otra Currency a algo
   * comparable con esa suma. En vez de sumar montos de distintas monedas como
   * si fueran uno solo (número sin sentido financiero), se excluyen las
   * facturas/facturas de compra en moneda no-base del cálculo - mismo
   * criterio que el resto del proyecto usa para no inventar una conversión
   * que el modelo de datos no respalda.
   */
  async getCashflowProjection(query: CashflowProjectionQueryDto): Promise<CashflowProjection> {
    const from = query.fromDate ? dateOnlyUTC(new Date(query.fromDate)) : dateOnlyUTC(new Date());
    const to = query.toDate
      ? dateOnlyUTC(new Date(query.toDate))
      : addDays(from, Number(query.period ?? 30) - 1);

    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('toDate must not be before fromDate');
    }

    const db = getTenantDb();
    const [accounts, invoices, purchaseInvoices, checks] = await Promise.all([
      db.financialAccount.findMany(),
      db.invoice.findMany({
        where: {
          balanceDue: { gt: 0 },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
          currency: { isBase: true },
        },
      }),
      db.purchaseInvoice.findMany({
        where: { balanceDue: { gt: 0 }, status: { not: 'CANCELLED' }, currency: { isBase: true } },
      }),
      db.check.findMany({
        where: {
          OR: [
            { kind: 'THIRD_PARTY', status: 'PORTFOLIO' },
            { kind: 'OWN', status: 'ISSUED' },
          ],
        },
        include: { customer: { select: { name: true } }, supplier: { select: { name: true } } },
      }),
    ]);

    const openingBalance = accounts.reduce(
      (sum, a) => sum.add(a.currentBalance),
      new Prisma.Decimal(0),
    );

    // Vencido o sin dueDate cae en la primera semana (misma convención que
    // PayablesService.getAgingReport para "sin dueDate -> corriente");
    // fuera del horizonte pedido (después de `to`) queda afuera de la
    // proyección, no se acumula en ningún lado.
    const effectiveDate = (dueDate: Date | null): Date | null => {
      const d = dueDate ? dateOnlyUTC(dueDate) : from;
      if (d.getTime() > to.getTime()) return null;
      return d.getTime() < from.getTime() ? from : d;
    };

    const weeks: WeekAccumulator[] = [];
    for (let weekStart = from; weekStart.getTime() <= to.getTime(); weekStart = addDays(weekStart, 7)) {
      const naiveEnd = addDays(weekStart, 6);
      weeks.push({
        weekStart,
        weekEnd: naiveEnd.getTime() > to.getTime() ? to : naiveEnd,
        inflows: new Prisma.Decimal(0),
        outflows: new Prisma.Decimal(0),
        invoiceInflows: [],
        checkInflows: [],
        invoiceOutflows: [],
        checkOutflows: [],
      });
    }

    const bucketFor = (date: Date): WeekAccumulator | undefined => {
      const iso = isoDate(date);
      return weeks.find((w) => isoDate(w.weekStart) <= iso && iso <= isoDate(w.weekEnd));
    };

    for (const invoice of invoices) {
      const eff = effectiveDate(invoice.dueDate);
      const bucket = eff && bucketFor(eff);
      if (!bucket) continue;
      bucket.inflows = bucket.inflows.add(invoice.balanceDue);
      bucket.invoiceInflows.push({
        id: invoice.id,
        type: 'INVOICE',
        reference: `${invoice.documentLetter}-${invoice.pointOfSale}-${invoice.number}`,
        counterparty: invoice.customerName,
        dueDate: invoice.dueDate ? isoDate(invoice.dueDate) : null,
        amount: invoice.balanceDue.toNumber(),
      });
    }

    for (const purchaseInvoice of purchaseInvoices) {
      const eff = effectiveDate(purchaseInvoice.dueDate);
      const bucket = eff && bucketFor(eff);
      if (!bucket) continue;
      bucket.outflows = bucket.outflows.add(purchaseInvoice.balanceDue);
      bucket.invoiceOutflows.push({
        id: purchaseInvoice.id,
        type: 'INVOICE',
        reference: purchaseInvoice.supplierInvoiceNumber,
        counterparty: purchaseInvoice.supplierName,
        dueDate: purchaseInvoice.dueDate ? isoDate(purchaseInvoice.dueDate) : null,
        amount: purchaseInvoice.balanceDue.toNumber(),
      });
    }

    for (const check of checks) {
      const eff = effectiveDate(check.dueDate);
      const bucket = eff && bucketFor(eff);
      if (!bucket) continue;
      const item: CashflowLineItem = {
        id: check.id,
        type: 'CHECK',
        reference: check.number,
        counterparty: check.kind === 'THIRD_PARTY' ? (check.customer?.name ?? null) : (check.supplier?.name ?? null),
        dueDate: isoDate(check.dueDate),
        amount: check.amount.toNumber(),
      };
      if (check.kind === 'THIRD_PARTY') {
        bucket.inflows = bucket.inflows.add(check.amount);
        bucket.checkInflows.push(item);
      } else {
        bucket.outflows = bucket.outflows.add(check.amount);
        bucket.checkOutflows.push(item);
      }
    }

    let running = openingBalance;
    const weekBuckets: CashflowWeekBucket[] = weeks.map((w) => {
      const netChange = w.inflows.sub(w.outflows);
      running = running.add(netChange);
      return {
        weekStart: isoDate(w.weekStart),
        weekEnd: isoDate(w.weekEnd),
        inflows: w.inflows.toNumber(),
        outflows: w.outflows.toNumber(),
        netChange: netChange.toNumber(),
        projectedBalance: running.toNumber(),
        invoiceInflows: w.invoiceInflows,
        checkInflows: w.checkInflows,
        invoiceOutflows: w.invoiceOutflows,
        checkOutflows: w.checkOutflows,
      };
    });

    const totalInflows = weeks.reduce((sum, w) => sum.add(w.inflows), new Prisma.Decimal(0));
    const totalOutflows = weeks.reduce((sum, w) => sum.add(w.outflows), new Prisma.Decimal(0));

    return {
      fromDate: isoDate(from),
      toDate: isoDate(to),
      openingBalance: openingBalance.toNumber(),
      totalInflows: totalInflows.toNumber(),
      totalOutflows: totalOutflows.toNumber(),
      closingBalance: openingBalance.add(totalInflows).sub(totalOutflows).toNumber(),
      hasNegativeWeek: weekBuckets.some((w) => w.projectedBalance < 0),
      weeks: weekBuckets,
    };
  }
}
