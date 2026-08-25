import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountingService } from '@plexo/accounting';
import { getTenantDb } from '@plexo/database';
import { InvoicingService } from '@plexo/invoicing';
import { ReportsFinancialService } from '@plexo/reports-financial';
import { CheckService } from '@plexo/treasury';

/**
 * Composición-root para las acciones de Cartera de Cheques que necesitan
 * más de un lib module a la vez (CheckService no puede importar
 * @plexo/reports-financial/@plexo/invoicing/@plexo/accounting - regla del
 * repo). Mismo criterio que SalesService/PurchaseInvoicesService: la
 * atomicidad viene gratis porque todo corre por getTenantDb(), la misma
 * transacción por-request que TenantContextInterceptor ya abrió.
 */
@Injectable()
export class TreasuryService {
  constructor(
    private readonly checkService: CheckService,
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly invoicingService: InvoicingService,
    private readonly accountingService: AccountingService,
  ) {}

  listChecks(filters: Parameters<CheckService['listChecks']>[0]) {
    return this.checkService.listChecks(filters);
  }

  getCheck(id: string) {
    return this.checkService.getCheck(id);
  }

  /** PORTFOLIO -> DEPOSITED, y recién acá se acredita de verdad en la
   * cuenta bancaria elegida (antes de esto el cheque físicamente en
   * cartera nunca tocó ninguna FinancialAccount). */
  async depositCheck(checkId: string, financialAccountId: string) {
    const check = await this.checkService.depositCheck(checkId, financialAccountId);
    await this.reportsFinancialService.recordFinancialTransaction({
      financialAccountId,
      amount: check.amount.toNumber(),
      externalRef: `Depósito cheque ${check.number} (${check.bankName})`,
    });
    return check;
  }

  /** DEPOSITED -> CLEARED (tercero, sólo confirma - el depósito ya había
   * acreditado la plata) o ISSUED -> CLEARED (propio, recién acá sale la
   * plata de verdad de la cuenta que lo respalda). */
  async markCleared(checkId: string) {
    const check = await this.checkService.markCleared(checkId);
    if (check.kind === 'OWN' && check.financialAccountId) {
      await this.reportsFinancialService.recordFinancialTransaction({
        financialAccountId: check.financialAccountId,
        amount: -check.amount.toNumber(),
        externalRef: `Pago cheque propio ${check.number} (${check.bankName})`,
      });
    }
    return check;
  }

  /** PORTFOLIO|DEPOSITED|ENDORSED -> REJECTED. Reabre la deuda del
   * cliente (reversando exactamente el cobro original, sin importar si
   * después se depositó/endosó) y, si estaba depositado, revierte el
   * crédito que ese depósito le había dado a la cuenta bancaria. No
   * reabre automáticamente la cuenta por pagar del proveedor si el
   * cheque ya estaba endosado - ver el límite de alcance documentado en
   * el plan de esta feature. */
  async rejectCheck(checkId: string, data: { reason: string; feeAmount?: number }) {
    const { check, wasDeposited } = await this.checkService.rejectCheck(checkId, data);

    if (wasDeposited && check.financialAccountId) {
      await this.reportsFinancialService.recordFinancialTransaction({
        financialAccountId: check.financialAccountId,
        amount: -check.amount.toNumber(),
        externalRef: `Rechazo cheque ${check.number} (${check.bankName})`,
      });
    }

    if (!check.receiptId) {
      // No debería pasar (rejectCheck sólo acepta THIRD_PARTY, que siempre
      // nace de un Recibo) - defensa en profundidad, no un camino real.
      throw new NotFoundException('Rejected check has no originating receipt');
    }
    const receipt = await getTenantDb().receipt.findUnique({
      where: { id: check.receiptId },
      select: { invoiceId: true },
    });
    if (!receipt) {
      throw new NotFoundException('Originating receipt not found');
    }

    await this.invoicingService.reopenInvoiceBalance(
      receipt.invoiceId,
      check.amount,
      check.rejectionFeeAmount ?? 0,
    );
    await this.accountingService.postCheckRejectionJournalEntry({
      checkId: check.id,
      amount: check.amount,
      feeAmount: check.rejectionFeeAmount ?? 0,
      date: check.rejectedAt ?? new Date(),
    });

    return check;
  }
}
