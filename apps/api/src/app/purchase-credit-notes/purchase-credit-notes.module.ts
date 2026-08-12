import { Module } from '@nestjs/common';
import { AccountingModule } from '@plexo/accounting';
import { PurchasesModule } from '@plexo/purchases';
import { PurchaseCreditNotesController } from './purchase-credit-notes.controller.js';
import { PurchaseCreditNotesService } from './purchase-credit-notes.service.js';

@Module({
  imports: [PurchasesModule, AccountingModule],
  controllers: [PurchaseCreditNotesController],
  providers: [PurchaseCreditNotesService],
})
export class PurchaseCreditNotesModule {}
