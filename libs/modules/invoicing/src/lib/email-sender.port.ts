export interface InvoiceEmailPayload {
  to: string;
  invoiceNumber: string;
  total: string;
}

/**
 * No real provider chosen yet (Resend/SES/SMTP - deferred). InvoicingService
 * depends on this interface, not a concrete implementation, so swapping in a
 * real sender later is one new class + one line in InvoicingModule, not a
 * change to InvoicingService.
 */
export interface EmailSender {
  sendInvoiceEmail(payload: InvoiceEmailPayload): Promise<void>;
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
