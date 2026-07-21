import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { EmailSender, InvoiceEmailPayload } from './email-sender.port.js';

/**
 * Real sender, wired in only when RESEND_API_KEY is set (see
 * InvoicingModule) - local/dev environments without one keep getting the
 * console stub instead of a crash. Failures are logged, not thrown: a
 * bounced/undeliverable email is not a reason to fail the invoice that
 * already got created and posted to the ledger in the same request.
 */
@Injectable()
export class ResendEmailSender implements EmailSender {
  private readonly logger = new Logger(ResendEmailSender.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: payload.to,
      subject: `Factura ${payload.invoiceNumber}`,
      text: `Se emitió tu factura ${payload.invoiceNumber} por un total de $${payload.total}.`,
    });

    if (error) {
      this.logger.error(
        `Failed to email invoice ${payload.invoiceNumber} to ${payload.to}: ${error.message}`,
      );
    }
  }
}
