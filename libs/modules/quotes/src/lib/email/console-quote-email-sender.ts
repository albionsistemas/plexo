import { Injectable, Logger } from '@nestjs/common';
import type { QuoteEmailPayload, QuoteEmailSender } from './quote-email-sender.port.js';

/** Logs instead of sending. Used when RESEND_API_KEY/EMAIL_FROM aren't set. */
@Injectable()
export class ConsoleQuoteEmailSender implements QuoteEmailSender {
  private readonly logger = new Logger(ConsoleQuoteEmailSender.name);

  async sendQuoteEmail(payload: QuoteEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email quote ${payload.quoteNumber} (total ${payload.currencyCode} ${payload.total}) to ${payload.to} (${payload.customerName}) from ${payload.from ?? '(default sender)'}, attaching ${payload.pdfFilename}`,
    );
  }
}
