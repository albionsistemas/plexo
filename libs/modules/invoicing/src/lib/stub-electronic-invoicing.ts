import { Injectable, Logger } from '@nestjs/common';
import type {
  ElectronicInvoiceRequest,
  ElectronicInvoiceResult,
  ElectronicInvoicingPort,
} from './electronic-invoicing.port.js';

const CAE_VALIDITY_DAYS = 10;

/** Fake CAE, never touches AFIP. Replace with a real WSFE client once the
 * tenant has AFIP homologation credentials. */
@Injectable()
export class StubElectronicInvoicingService implements ElectronicInvoicingPort {
  private readonly logger = new Logger(StubElectronicInvoicingService.name);

  async requestCae(invoice: ElectronicInvoiceRequest): Promise<ElectronicInvoiceResult> {
    this.logger.warn(
      `[stub] issuing a fake CAE for invoice ${invoice.number} - not a real AFIP authorization`,
    );
    return {
      cae: `STUB-${Date.now()}`,
      caeExpiry: new Date(Date.now() + CAE_VALIDITY_DAYS * 24 * 60 * 60 * 1000),
    };
  }
}
