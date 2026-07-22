import { Injectable } from '@nestjs/common';
import { AfipNotConfiguredError, type AfipPadronData, type AfipPadronPort } from './afip-padron.port.js';

/**
 * Wired in whenever AFIP_CERT_PATH/AFIP_KEY_PATH/AFIP_CUIT_REPRESENTADA
 * aren't all set (see companies.module.ts) - same fallback shape as
 * ConsoleEmailSender in the invoicing module, except this one throws
 * instead of silently no-op'ing: a CUIT lookup is a synchronous,
 * user-initiated action (a button click), not a background side effect,
 * so the frontend needs a real error to show instead of pretending it
 * worked.
 */
@Injectable()
export class StubAfipPadronService implements AfipPadronPort {
  lookup(_cuit: string): Promise<AfipPadronData | null> {
    throw new AfipNotConfiguredError();
  }
}
