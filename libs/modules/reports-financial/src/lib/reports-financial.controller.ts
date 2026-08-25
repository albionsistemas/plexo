import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { CashflowProjectionExcelService } from './cashflow-projection-excel.service.js';
import { CashflowProjectionQueryDto } from './dto/cashflow-projection-query.dto.js';
import { CreateFinancialAccountDto } from './dto/create-financial-account.dto.js';
import { RecordFinancialTransactionDto } from './dto/record-financial-transaction.dto.js';
import { TransferBetweenAccountsDto } from './dto/transfer-between-accounts.dto.js';
import { ReportsFinancialService } from './reports-financial.service.js';

const MODULE = 'reports-financial';

@Controller('reports/financial')
export class ReportsFinancialController {
  constructor(
    private readonly reportsFinancialService: ReportsFinancialService,
    private readonly cashflowProjectionExcelService: CashflowProjectionExcelService,
  ) {}

  @RequireModuleAccess(MODULE, 'write')
  @Post('accounts')
  createFinancialAccount(@Body() dto: CreateFinancialAccountDto) {
    return this.reportsFinancialService.createFinancialAccount(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts')
  listFinancialAccounts() {
    return this.reportsFinancialService.listFinancialAccounts();
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('transactions')
  recordFinancialTransaction(@Body() dto: RecordFinancialTransactionDto) {
    return this.reportsFinancialService.recordFinancialTransaction(dto);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('transfers')
  transferBetweenAccounts(@Body() dto: TransferBetweenAccountsDto) {
    return this.reportsFinancialService.transferBetweenAccounts(dto);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('transactions/:id/reconcile')
  reconcileTransaction(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsFinancialService.reconcileTransaction(id);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('transactions/unreconciled')
  listUnreconciledTransactions(@Query('financialAccountId') financialAccountId?: string) {
    return this.reportsFinancialService.listUnreconciledTransactions(financialAccountId);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts/:id/reconciliation')
  getReconciliationSummary(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsFinancialService.getReconciliationSummary(id);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts/:id/transactions')
  listTransactions(@Param('id', ParseUUIDPipe) id: string) {
    return this.reportsFinancialService.listTransactions(id);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('cashflow-projection')
  getCashflowProjection(@Query() query: CashflowProjectionQueryDto) {
    return this.reportsFinancialService.getCashflowProjection(query);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('cashflow-projection/excel')
  async downloadCashflowProjectionExcel(@Query() query: CashflowProjectionQueryDto) {
    const result = await this.reportsFinancialService.getCashflowProjection(query);
    const buffer = await this.cashflowProjectionExcelService.generate(result);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="flujo-de-caja_${result.fromDate}_${result.toDate}.xlsx"`,
    });
  }
}
