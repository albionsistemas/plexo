/** Shared data shape all 5 templates render from, built once by
 * QuoteService.generatePdf. Customer-facing (unlike @plexo/inventory-cart's
 * single-template cart export) - full 5-style system, same as
 * @plexo/purchases, but a standalone copy: no module imports another
 * module's internals (see purchase-email-sender.port.ts for the same rule
 * applied to email senders). */
export interface QuotePdfLine {
  articleName: string;
  variantLabel: string | null;
  sku: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  // null en líneas de cotizaciones creadas antes del desglose de IVA por
  // línea (ver schema.prisma QuoteLine) - la plantilla omite la columna
  // "Alícuota" para esas filas puntuales, no para el documento entero.
  vatLabel: string | null;
}

/** null cuando NINGUNA línea del comprobante tiene desglose de IVA propio
 * (cotización creada antes de esta función) - la plantilla en ese caso no
 * muestra el resumen por alícuota y sólo el Total plano de siempre, mismo
 * criterio de degradación que el resto de "IVA por línea" en la app. */
export interface QuotePdfVatSummary {
  netTaxed: string;
  netExempt: string;
  vat21: string;
  vat10_5: string;
  vat27: string;
  vatOther: string;
  vatTotal: string;
}

export interface QuotePdfData {
  number: string;
  issueDate: string;
  validUntil: string | null;
  tenantName: string;
  tenantTaxId: string | null;
  customerName: string;
  customerTaxId: string | null;
  customerAddress: string | null;
  currencyCode: string;
  lines: QuotePdfLine[];
  total: string;
  vatSummary: QuotePdfVatSummary | null;
  notes: string | null;
}
