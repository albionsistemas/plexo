import { Logger, Module } from '@nestjs/common';
import { ConsolePurchaseEmailSender } from './email/console-purchase-email-sender.js';
import { PURCHASE_EMAIL_SENDER, type PurchaseEmailSender } from './email/purchase-email-sender.port.js';
import { ResendPurchaseEmailSender } from './email/resend-purchase-email-sender.js';
import { GoodsReceiptAttachmentService } from './goods-receipt-attachment.service.js';
import { GoodsReceiptService } from './goods-receipt.service.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { PurchaseCatalogsController } from './purchase-catalogs.controller.js';
import { PurchaseCatalogsService } from './purchase-catalogs.service.js';
import { PurchaseInvoiceAttachmentService } from './purchase-invoice-attachment.service.js';
import { PurchaseInvoiceService } from './purchase-invoice.service.js';
import { PurchaseNumberingService } from './purchase-numbering.service.js';
import { PurchaseOrderController } from './purchase-order.controller.js';
import { PurchaseOrderService } from './purchase-order.service.js';
import { PurchasePreferencesController } from './purchase-preferences.controller.js';
import { PurchasePreferencesService } from './purchase-preferences.service.js';
import { QuoteRequestController } from './quote-request.controller.js';
import { QuoteRequestService } from './quote-request.service.js';
import { SupplierReturnService } from './supplier-return.service.js';

const logger = new Logger('PurchasesModule');

/** Same "global config, not per-tenant" convention as InvoicingModule's
 * createEmailSender - one Resend account/from-address for the whole app,
 * falls back to the console stub when RESEND_API_KEY isn't set. A second,
 * independent Resend client from invoicing's on purpose - see
 * purchase-email-sender.port.ts for why. */
function createPurchaseEmailSender(): PurchaseEmailSender {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['EMAIL_FROM'];
  if (!apiKey || !from) {
    logger.warn(
      'RESEND_API_KEY/EMAIL_FROM not set - purchase order emails will only be logged, not sent',
    );
    return new ConsolePurchaseEmailSender();
  }
  return new ResendPurchaseEmailSender(apiKey, from);
}

@Module({
  controllers: [
    PurchaseCatalogsController,
    PurchasePreferencesController,
    QuoteRequestController,
    PurchaseOrderController,
  ],
  providers: [
    PurchaseCatalogsService,
    PurchaseNumberingService,
    PurchasePreferencesService,
    PdfGeneratorService,
    QuoteRequestService,
    PurchaseOrderService,
    GoodsReceiptService,
    GoodsReceiptAttachmentService,
    SupplierReturnService,
    PurchaseInvoiceService,
    PurchaseInvoiceAttachmentService,
    { provide: PURCHASE_EMAIL_SENDER, useFactory: createPurchaseEmailSender },
  ],
  // GoodsReceiptService/GoodsReceiptAttachmentService/SupplierReturnService/
  // PurchaseInvoiceService have no controller of their own here - apps/api's
  // GoodsReceiptsModule/SupplierReturnsModule/PurchaseInvoicesModule compose
  // them with InventoryService/AccountingService (see those modules' own
  // doc comments for why that composition can't live inside this lib).
  exports: [
    QuoteRequestService,
    PurchaseOrderService,
    GoodsReceiptService,
    GoodsReceiptAttachmentService,
    SupplierReturnService,
    PurchaseInvoiceService,
    PurchaseInvoiceAttachmentService,
  ],
})
export class PurchasesModule {}
