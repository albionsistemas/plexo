export interface QuoteEmailPayload {
  to: string;
  quoteNumber: string;
  customerName: string;
  total: string;
  currencyCode: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  /** Per-tenant custom sender, same meaning as invoicing's EmailSender.from
   * (see resolveEmailFrom in @plexo/tenant-settings) - undefined means "use
   * this sender's own default". */
  from?: string;
}

/**
 * Own port for Cotizaciones, not a reuse of invoicing's or purchases' own
 * senders - modules never import each other's Service (see
 * purchase-email-sender.port.ts for the same rule), so this duplicates a
 * small Resend client instead of crossing that boundary. Real
 * implementation is ResendQuoteEmailSender; falls back to
 * ConsoleQuoteEmailSender when RESEND_API_KEY/EMAIL_FROM aren't set.
 */
export interface QuoteEmailSender {
  sendQuoteEmail(payload: QuoteEmailPayload): Promise<void>;
}

export const QUOTE_EMAIL_SENDER = Symbol('QUOTE_EMAIL_SENDER');
