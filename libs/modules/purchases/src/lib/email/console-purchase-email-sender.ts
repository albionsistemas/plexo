import { Injectable, Logger } from '@nestjs/common';
import type { PurchaseEmailSender, PurchaseOrderEmailPayload } from './purchase-email-sender.port.js';

/** Logs instead of sending. Used when RESEND_API_KEY/EMAIL_FROM aren't set. */
@Injectable()
export class ConsolePurchaseEmailSender implements PurchaseEmailSender {
  private readonly logger = new Logger(ConsolePurchaseEmailSender.name);

  async sendPurchaseOrderEmail(payload: PurchaseOrderEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email purchase order ${payload.purchaseOrderNumber} (total ${payload.currencyCode} ${payload.total}) to ${payload.to} (${payload.supplierName}) from ${payload.from ?? '(default sender)'}, attaching ${payload.pdfFilename}`,
    );
  }
}
