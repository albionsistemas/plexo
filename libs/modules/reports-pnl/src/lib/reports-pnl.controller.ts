import { Controller, Get, Query } from '@nestjs/common';
import { RequireModuleAccess } from '@plexo/auth';
import { DateRangeQueryDto } from './dto/date-range-query.dto.js';
import { ReportsPnlService } from './reports-pnl.service.js';

const MODULE = 'reports-pnl';

@Controller('reports/pnl')
export class ReportsPnlController {
  constructor(private readonly reportsPnlService: ReportsPnlService) {}

  @RequireModuleAccess(MODULE, 'read')
  @Get('income-statement')
  getIncomeStatement(@Query() query: DateRangeQueryDto) {
    return this.reportsPnlService.getIncomeStatement(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }

  @RequireModuleAccess(MODULE, 'read')
  @Get('revenue-summary')
  getRevenueSummary(@Query() query: DateRangeQueryDto) {
    return this.reportsPnlService.getRevenueSummary(
      query.from ? new Date(query.from) : undefined,
      query.to ? new Date(query.to) : undefined,
    );
  }
}
