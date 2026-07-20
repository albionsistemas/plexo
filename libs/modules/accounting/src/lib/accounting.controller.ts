import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { AccountingService } from './accounting.service.js';
import { CreateAccountDto } from './dto/create-account.dto.js';
import { CreateReversingEntryDto } from './dto/create-reversing-entry.dto.js';
import { PostJournalEntryDto } from './dto/post-journal-entry.dto.js';

const MODULE = 'accounting';

@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @RequireModuleAccess(MODULE, 'write')
  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto) {
    return this.accountingService.createAccount(dto);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts')
  listAccounts() {
    return this.accountingService.listAccounts();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('accounts/:id/ledger')
  getAccountLedger(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.getAccountLedger(id);
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('trial-balance')
  getTrialBalance() {
    return this.accountingService.getTrialBalance();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('journal-entries')
  listJournalEntries() {
    return this.accountingService.listJournalEntries();
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('journal-entries/:id')
  getJournalEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.accountingService.getJournalEntry(id);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('journal-entries')
  postJournalEntry(@Body() dto: PostJournalEntryDto) {
    return this.accountingService.postJournalEntry(dto);
  }

  @RequireModuleAccess(MODULE, 'write')
  @Post('journal-entries/reversals')
  createReversingEntry(@Body() dto: CreateReversingEntryDto) {
    return this.accountingService.createReversingEntry(dto);
  }
}
