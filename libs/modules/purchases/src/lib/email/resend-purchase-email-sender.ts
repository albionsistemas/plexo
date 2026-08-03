import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type {
  FollowUpEmailPayload,
  PurchaseEmailSender,
  PurchaseOrderEmailPayload,
} from './purchase-email-sender.port.js';

/** Real sender, wired in only when RESEND_API_KEY is set (see
 * PurchasesModule) - mirrors invoicing's ResendEmailSender. Failures are
 * logged, not thrown: a bounced email isn't a reason to fail the request
 * that already saved the purchase order. */
@Injectable()
export class ResendPurchaseEmailSender implements PurchaseEmailSender {
  private readonly logger = new Logger(ResendPurchaseEmailSender.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async sendPurchaseOrderEmail(payload: PurchaseOrderEmailPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: payload.from ?? this.from,
      to: payload.to,
      subject: `Orden de Compra ${payload.purchaseOrderNumber}`,
      text: `Te enviamos la Orden de Compra ${payload.purchaseOrderNumber} por un total de ${payload.currencyCode} ${payload.total}.`,
      attachments: [{ filename: payload.pdfFilename, content: payload.pdfBuffer }],
    });

    if (error) {
      this.logger.error(
        `Failed to email purchase order ${payload.purchaseOrderNumber} to ${payload.to}: ${error.message}`,
      );
    }
  }

  async sendFollowUpEmail(payload: FollowUpEmailPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: payload.from ?? this.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });

    if (error) {
      this.logger.error(`Failed to email follow-up to ${payload.to}: ${error.message}`);
    }
  }
}
