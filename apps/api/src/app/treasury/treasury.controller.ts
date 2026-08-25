import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { DepositCheckDto, ListChecksQueryDto, RejectCheckDto } from '@plexo/treasury';
import { TreasuryService } from './treasury.service.js';

const READ_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES', 'INVENTORY'] as const;
const WRITE_ROLES = ['OWNER', 'ADMIN', 'ACCOUNTANT'] as const;

@Controller('treasury/checks')
export class TreasuryController {
  constructor(private readonly treasuryService: TreasuryService) {}

  @Roles(...READ_ROLES)
  @Get()
  list(@Query() query: ListChecksQueryDto) {
    return this.treasuryService.listChecks({
      status: query.status,
      kind: query.kind,
      bankName: query.bankName,
      dueFrom: query.dueFrom ? new Date(query.dueFrom) : undefined,
      dueTo: query.dueTo ? new Date(query.dueTo) : undefined,
    });
  }

  @Roles(...READ_ROLES)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.treasuryService.getCheck(id);
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/deposit')
  deposit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DepositCheckDto) {
    return this.treasuryService.depositCheck(id, dto.financialAccountId);
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/clear')
  markCleared(@Param('id', ParseUUIDPipe) id: string) {
    return this.treasuryService.markCleared(id);
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/reject')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectCheckDto) {
    return this.treasuryService.rejectCheck(id, { reason: dto.reason, feeAmount: dto.feeAmount });
  }
}
