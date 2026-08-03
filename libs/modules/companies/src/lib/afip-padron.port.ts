export type AfipPersonType = 'FISICA' | 'JURIDICA';

export interface AfipPadronData {
  cuit: string;
  personType: AfipPersonType;
  /** Razón social (jurídica) o nombre completo (física). */
  name: string;
  /** Best-effort label ("Responsable Inscripto", "Monotributo (...)") derived
   * from the padrón response - not a closed enum, AFIP's own categories
   * change over time. Not persisted anywhere, only shown to the user. */
  taxCondition: string | null;
  fiscalAddress: string | null;
}

/**
 * ws_sr_padron_a13 - AFIP's public-persona lookup by CUIT. Needs the
 * current tenant's AFIP certificate (same one uploaded in Preferencias for
 * WSFE, see RealAfipPadronService/AfipCredentialsService) - lookup() throws
 * AfipNotConfiguredError when this tenant hasn't uploaded one yet.
 */
export interface AfipPadronPort {
  /** null when AFIP has no record for this CUIT. */
  lookup(cuit: string): Promise<AfipPadronData | null>;
}

export const AFIP_PADRON = Symbol('AFIP_PADRON');

export class AfipNotConfiguredError extends Error {
  constructor() {
    super('AFIP lookup is not configured on this server');
    this.name = 'AfipNotConfiguredError';
  }
}

export class AfipLookupError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AfipLookupError';
  }
}
