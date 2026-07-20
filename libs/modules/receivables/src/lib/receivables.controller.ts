import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { ReceivablesService } from './receivables.service.js';

const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES'] as const;
const WRITE_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

@Controller('receivables')
export class ReceivablesController {
  constructor(private readonly receivablesService: ReceivablesService) {}

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
  getCustomerStatement(@Param('id', ParseUUIDPipe) id: string) {
    return this.receivablesService.getCustomerStatement(id);
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
