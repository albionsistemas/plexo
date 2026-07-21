import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountingModule } from '@plexo/accounting';
import { JwtAuthGuard, ModuleAccessGuard, RolesGuard } from '@plexo/auth';
import { CompaniesModule } from '@plexo/companies';
import { DatabaseModule } from '@plexo/database';
import { InventoryModule } from '@plexo/inventory';
import { InvoicingModule } from '@plexo/invoicing';
import { ReceivablesModule } from '@plexo/receivables';
import { ReportsFinancialModule } from '@plexo/reports-financial';
import { ReportsPnlModule } from '@plexo/reports-pnl';
import { ReportsSalesModule } from '@plexo/reports-sales';
import { TaxesModule } from '@plexo/taxes';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { SalesModule } from './sales/sales.module.js';
import { SchedulerModule } from './scheduler/scheduler.module.js';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    CompaniesModule,
    InventoryModule,
    InvoicingModule,
    ReceivablesModule,
    AccountingModule,
    TaxesModule,
    ReportsPnlModule,
    ReportsSalesModule,
    ReportsFinancialModule,
    SalesModule,
    DashboardModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: JwtAuthGuard populates request.user before the other
    // two read it. Nest always runs global guards in this registration order.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
export class AppModule {}
