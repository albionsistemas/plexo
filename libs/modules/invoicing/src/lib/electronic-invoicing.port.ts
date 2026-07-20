import type { Prisma } from '@plexo/database';

export interface ElectronicInvoiceRequest {
  number: string;
  total: Prisma.Decimal;
}

export interface ElectronicInvoiceResult {
  cae: string;
  caeExpiry: Date;
}

/**
 * Stands in for AFIP's WSFE web service (real integration needs the
 * tenant's own AFIP certificates/CUIT and homologation testing - not
 * something to fake here). schema.afipCae/afipCaeExpiry already exist on
 * Invoice so wiring in a real implementation later is additive.
 */
export interface ElectronicInvoicingPort {
  requestCae(invoice: ElectronicInvoiceRequest): Promise<ElectronicInvoiceResult>;
}

export const ELECTRONIC_INVOICING = Symbol('ELECTRONIC_INVOICING');
