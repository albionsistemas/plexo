import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateCurrencyDto } from './dto/create-currency.dto.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { RecordExchangeRateDto } from './dto/record-exchange-rate.dto.js';
import { RecordReceiptDto } from './dto/record-receipt.dto.js';
import { InvoicingService } from './invoicing.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('invoicing')
export class InvoicingController {
  constructor(private readonly invoicingService: InvoicingService) {}

  @Roles(...WRITE_ROLES)
  @Post('customers')
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.invoicingService.createCustomer(dto);
  }

  @Get('customers')
  listCustomers() {
    return this.invoicingService.listCustomers();
  }

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

  @Roles(...WRITE_ROLES)
  @Post('credit-notes')
  createCreditNote(@Body() dto: CreateCreditNoteDto) {
    return this.invoicingService.createCreditNote(dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('receipts')
  recordReceipt(@Body() dto: RecordReceiptDto) {
    return this.invoicingService.recordReceipt(dto);
  }
}
