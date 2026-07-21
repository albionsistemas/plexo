export interface InvoiceEmailPayload {
  to: string;
  invoiceNumber: string;
  total: string;
}

export interface OverdueAlertEmailPayload {
  to: string;
  invoiceNumber: string;
  balanceDue: string;
  dueDate: string;
}

/**
 * Resend is the real provider (see ResendEmailSender); InvoicingService
 * depends on this interface, not the concrete class, so swapping providers
 * later is one new class + one line in InvoicingModule, not a change to
 * InvoicingService.
 */
export interface EmailSender {
  sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void>;
  sendOverdueAlertEmail(payload: OverdueAlertEmailPayload): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
