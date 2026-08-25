import { Module } from '@nestjs/common';
import { CheckService } from './treasury.service.js';

// Sin controller propio a propósito: toda la HTTP surface de Cartera de
// Cheques (lectura Y escritura) vive en la composición-root
// apps/api/src/app/treasury/ (necesita componer con
// @plexo/reports-financial/@plexo/invoicing/@plexo/accounting para las
// acciones de escritura) - mismo criterio que @plexo/purchases no tiene su
// propio purchase-invoice.controller.ts, sólo apps/api's
// PurchaseInvoicesController. Un controller acá duplicaría la ruta
// GET treasury/checks.
@Module({
  providers: [CheckService],
  exports: [CheckService],
})
export class TreasuryModule {}
