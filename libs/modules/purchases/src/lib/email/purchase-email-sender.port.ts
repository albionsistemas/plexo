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

/** A short follow-up nudge ("¿ya despachaste la OC?"), not the order itself -
 * no PDF attachment, subject/text chosen by the user (one of 5 templates or
 * free text, see PurchaseOrderFollowUpModal on the frontend). Kept separate
 * from PurchaseOrderEmailPayload rather than making pdfBuffer/pdfFilename
 * optional there - that struct is specifically "the order as an email", this
 * one is "any short message to the supplier". */
export interface FollowUpEmailPayload {
  to: string;
  subject: string;
  text: string;
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
  sendFollowUpEmail(payload: FollowUpEmailPayload): Promise<void>;
}

export const PURCHASE_EMAIL_SENDER = Symbol('PURCHASE_EMAIL_SENDER');
