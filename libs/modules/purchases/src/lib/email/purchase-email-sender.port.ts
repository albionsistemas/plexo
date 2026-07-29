export interface PurchaseOrderEmailPayload {
  to: string;
  purchaseOrderNumber: string;
  supplierName: string;
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
 * Own port for Compras, not a reuse of invoicing's EmailSender - modules
 * never import each other's Service (see PROGRESS.md's architecture
 * decisions), so this duplicates a small Resend client instead of crossing
 * that boundary. Real implementation is ResendPurchaseEmailSender; falls
 * back to ConsolePurchaseEmailSender when RESEND_API_KEY/EMAIL_FROM aren't
 * set, same as invoicing.
 */
export interface PurchaseEmailSender {
  sendPurchaseOrderEmail(payload: PurchaseOrderEmailPayload): Promise<void>;
}

export const PURCHASE_EMAIL_SENDER = Symbol('PURCHASE_EMAIL_SENDER');
