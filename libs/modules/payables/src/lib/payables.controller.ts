import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { PayablesService } from './payables.service.js';

// Same read-access terna as the rest of Compras (INVENTORY, not SALES -
// see purchase-order.controller.ts's own WRITE_ROLES) plus ACCOUNTANT,
// same criterion as ReceivablesController's READ_ROLES.
const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'INVENTORY'] as const;

@Controller('payables')
export class PayablesController {
  constructor(private readonly payablesService: PayablesService) {}

  @Roles(...READ_ROLES)
  @Get('aging')
  getAgingReport() {
    return this.payablesService.getAgingReport();
  }

  @Roles(...READ_ROLES)
  @Get('balances')
  listSupplierBalances() {
    return this.payablesService.listSupplierBalances();
  }

  @Roles(...READ_ROLES)
  @Get('suppliers/:id/statement')
  getSupplierStatement(@Param('id', ParseUUIDPipe) id: string) {
    return this.payablesService.getSupplierStatement(id);
  }
}
