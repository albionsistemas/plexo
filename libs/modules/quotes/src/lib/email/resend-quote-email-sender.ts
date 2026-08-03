import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { QuoteEmailPayload, QuoteEmailSender } from './quote-email-sender.port.js';

/** Real sender, wired in only when RESEND_API_KEY is set (see
 * QuotesModule) - mirrors purchases' ResendPurchaseEmailSender. Failures
 * are logged, not thrown: a bounced email isn't a reason to fail the
 * request that already saved the quote. */
@Injectable()
export class ResendQuoteEmailSender implements QuoteEmailSender {
  private readonly logger = new Logger(ResendQuoteEmailSender.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.resend = new Resend(apiKey);
    this.from = from;
  }

  async sendQuoteEmail(payload: QuoteEmailPayload): Promise<void> {
    const { error } = await this.resend.emails.send({
      from: payload.from ?? this.from,
      to: payload.to,
      subject: `Cotización ${payload.quoteNumber}`,
      text: `Te enviamos la cotización ${payload.quoteNumber} por un total de ${payload.currencyCode} ${payload.total}.`,
      attachments: [{ filename: payload.pdfFilename, content: payload.pdfBuffer }],
    });

    if (error) {
      this.logger.error(`Failed to email quote ${payload.quoteNumber} to ${payload.to}: ${error.message}`);
    }
  }
}
