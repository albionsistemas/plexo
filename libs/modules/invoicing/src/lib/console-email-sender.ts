import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailSender,
  InvoiceEmailPayload,
  OverdueAlertEmailPayload,
} from './email-sender.port.js';

/** Logs instead of sending. Used when RESEND_API_KEY/EMAIL_FROM aren't set. */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  async sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email invoice ${payload.invoiceNumber} (total ${payload.total}) to ${payload.to}`,
    );
  }

  async sendOverdueAlertEmail(payload: OverdueAlertEmailPayload): Promise<void> {
    this.logger.log(
      `[stub] would email overdue alert for invoice ${payload.invoiceNumber} (balance ${payload.balanceDue}, due ${payload.dueDate}) to ${payload.to}`,
    );
  }
}
