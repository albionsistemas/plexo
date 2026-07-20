import { Injectable, Logger } from '@nestjs/common';
import type { EmailSender, InvoiceEmailPayload } from './email-sender.port.js';

/** Logs instead of sending. Placeholder until a real provider is picked. */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email invoice ${payload.invoiceNumber} (total ${payload.total}) to ${payload.to}`,
    );
  }
}
