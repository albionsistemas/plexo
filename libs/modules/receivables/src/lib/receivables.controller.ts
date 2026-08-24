import { Controller, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { StatementQueryDto } from './dto/statement-query.dto.js';
import { ReceivablesService, type GetCustomerStatementOptions } from './receivables.service.js';
import { CustomerStatementExcelService } from './statement/customer-statement-excel.service.js';
import { CustomerStatementPdfService } from './statement/customer-statement-pdf.service.js';

const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES'] as const;
const WRITE_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

function parseStatementOptions(query: StatementQueryDto, pendingOnly?: string): GetCustomerStatementOptions {
  return {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    pendingOnly: pendingOnly === 'true',
  };
}

@Controller('receivables')
export class ReceivablesController {
  constructor(
    private readonly receivablesService: ReceivablesService,
    private readonly customerStatementPdfService: CustomerStatementPdfService,
    private readonly customerStatementExcelService: CustomerStatementExcelService,
  ) {}

  @Roles(...READ_ROLES)
  @Get('aging')
  getAgingReport() {
    return this.receivablesService.getAgingReport();
  }

  @Roles(...READ_ROLES)
  @Get('balances')
  listCustomerBalances() {
    return this.receivablesService.listCustomerBalances();
  }

  @Roles(...READ_ROLES)
  @Get('customers/:id/statement')
  getCustomerStatement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Query('pendingOnly') pendingOnly?: string,
  ) {
    return this.receivablesService.getCustomerStatement(id, parseStatementOptions(query, pendingOnly));
  }

  @Roles(...READ_ROLES)
  @Get('customers/:id/statement/pdf')
  async downloadCustomerStatementPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Query('pendingOnly') pendingOnly?: string,
  ) {
    const statement = await this.receivablesService.getCustomerStatement(id, parseStatementOptions(query, pendingOnly));
    const { buffer, filename } = await this.customerStatementPdfService.generate(statement);
    return new StreamableFile(buffer, { type: 'application/pdf', disposition: `attachment; filename="${filename}"` });
  }

  @Roles(...READ_ROLES)
  @Get('customers/:id/statement/excel')
  async downloadCustomerStatementExcel(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
    @Query('pendingOnly') pendingOnly?: string,
  ) {
    const statement = await this.receivablesService.getCustomerStatement(id, parseStatementOptions(query, pendingOnly));
    const buffer = await this.customerStatementExcelService.generate(statement);
    const customerSlug = statement.customerName.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="cuenta-corriente_${customerSlug}.xlsx"`,
    });
  }

  @Roles(...READ_ROLES)
  @Get('overdue')
  listOverdueInvoices() {
    return this.receivablesService.listOverdueInvoices();
  }

  @Roles(...WRITE_ROLES)
  @Post('overdue/refresh')
  refreshOverdueStatuses() {
    return this.receivablesService.refreshOverdueStatuses();
  }
}
