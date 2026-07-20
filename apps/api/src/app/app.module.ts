import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountingModule } from '@plexo/accounting';
import { JwtAuthGuard, ModuleAccessGuard, RolesGuard } from '@plexo/auth';
import { DatabaseModule } from '@plexo/database';
import { InventoryModule } from '@plexo/inventory';
import { InvoicingModule } from '@plexo/invoicing';
import { ReceivablesModule } from '@plexo/receivables';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module.js';
import { SalesModule } from './sales/sales.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    InventoryModule,
    InvoicingModule,
    ReceivablesModule,
    AccountingModule,
    SalesModule,
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
