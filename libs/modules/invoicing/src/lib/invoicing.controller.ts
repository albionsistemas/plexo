import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CreateCurrencyDto } from './dto/create-currency.dto.js';
import { RecordExchangeRateDto } from './dto/record-exchange-rate.dto.js';
import { RecordReceiptDto } from './dto/record-receipt.dto.js';
import { InvoicingService } from './invoicing.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  // Customers are managed via POST/GET /companies (role=CUSTOMER) now -
  // see @plexo/companies. A Company can be a customer, a supplier, and/or
  // one of the tenant's own branches, so that CRUD doesn't belong to
  // Invoicing specifically anymore.

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post('currencies')
  createCurrency(@Body() dto: CreateCurrencyDto) {
    return this.invoicingService.createCurrency(dto);
  }

  @Get('currencies')
  listCurrencies() {
    return this.invoicingService.listCurrencies();
  }

  @Roles('OWNER', 'ADMIN', 'ACCOUNTANT')
  @Post('exchange-rates')
  recordExchangeRate(@Body() dto: RecordExchangeRateDto) {
    return this.invoicingService.recordExchangeRate(dto);
  }

  @Get('invoices')
  listInvoices() {
    return this.invoicingService.listInvoices();
  }

  @Get('invoices/:id')
  getInvoice(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoicingService.getInvoice(id);
  }

  // Credit notes are created via POST /sales/credit-notes (SalesService),
  // not here - that's the composition that also reverses the invoice's
  // journal entry. InvoicingService.createCreditNote() stays on this
  // service for that composition to call; it's just not exposed as its
  // own route anymore, so there's no path that credits an invoice
  // without also closing out its GL entry.

  @Roles(...WRITE_ROLES)
  @Post('receipts')
  recordReceipt(@Body() dto: RecordReceiptDto) {
    return this.invoicingService.recordReceipt(dto);
  }
}
